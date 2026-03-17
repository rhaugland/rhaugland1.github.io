import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { createEvent, type CallEndedEvent, type SlushieEvent, type AnalystIncrementalEvent } from "@slushie/events";
import { analystPrompt, analystConsultationAnswerPrompt, analystSpecUpdatePrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, writeWorkspaceFile, readWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS, pipelineQueue } from "../queues";

function getRedisConnection() {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379"),
    password: parsed.password || undefined,
  };
}

export function createAnalystWorker() {
  return new Worker<SlushieEvent>(
    "analyst",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "call.ended") {
        await handleCallEnded(event as CallEndedEvent);
      } else if (event.type === "build.design.question") {
        await handleDesignQuestion(event);
      } else if (event.type === "review.complete") {
        await handleReviewComplete(event);
      } else if (event.type === "analyst.incremental") {
        await handleIncrementalAnalysis(event as AnalystIncrementalEvent);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
      settings: {
        backoffStrategy: (attemptsMade: number) => [1000, 10000, 60000][attemptsMade - 1] ?? 60000,
      },
    }
  );
}

async function handleCallEnded(event: CallEndedEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  log.info("analyst agent starting — processing transcript");

  const workspace = await getWorkspace(event.pipelineRunId);

  // load transcript and coaching log from database
  const call = await prisma.call.findUniqueOrThrow({
    where: { id: event.data.callId },
    include: { client: true },
  });

  await writeWorkspaceFile(workspace.transcriptPath, call.transcript ?? "");
  await writeWorkspaceFile(
    workspace.coachingLogPath,
    JSON.stringify(call.coachingLog ?? [], null, 2)
  );

  const clientContext = `industry: ${call.client.industry}, name: ${call.client.name}`;
  const specOutputPath = workspace.buildSpecPath(1);

  const prompt = analystPrompt({
    transcriptPath: workspace.transcriptPath,
    coachingLogPath: workspace.coachingLogPath,
    clientContext,
    outputPath: specOutputPath,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.analyst,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "analyst claude code session completed");

  // read and validate the spec file
  const specContent = await readWorkspaceFile(specOutputPath);
  const spec = JSON.parse(specContent);

  // check if analysis already exists for this call (e.g. from booking intake)
  const existingAnalysis = await prisma.analysis.findUnique({
    where: { callId: event.data.callId },
    include: { buildSpecs: { orderBy: { version: "desc" }, take: 1 } },
  });

  let analysis;
  let buildSpec;

  if (existingAnalysis) {
    // update existing analysis (booking intake → call update flow)
    analysis = await prisma.analysis.update({
      where: { id: existingAnalysis.id },
      data: {
        workflowMap: spec.workflowMap,
        gaps: spec.gaps,
        monetaryImpact: { total: spec.totalMonthlyImpact },
      },
    });

    const newVersion = (existingAnalysis.buildSpecs[0]?.version ?? 0) + 1;

    // copy spec to the versioned path so the builder can find it at buildSpecPath(newVersion)
    const versionedSpecPath = workspace.buildSpecPath(newVersion);
    await writeWorkspaceFile(versionedSpecPath, specContent);

    buildSpec = await prisma.buildSpec.create({
      data: {
        analysisId: analysis.id,
        version: newVersion,
        uiRequirements: spec.prototype.pages,
        dataModels: spec.prototype.mockEndpoints,
        integrations: spec.prototype.simulatedIntegrations,
        walkthroughSteps: spec.prototype.walkthroughSteps,
      },
    });

    log.info({ analysisId: analysis.id, version: newVersion }, "analyst updated existing analysis from call");

    await publishEvent(
      createEvent("analysis.complete", event.pipelineRunId, {
        analysisId: analysis.id,
        gapCount: spec.gaps.length,
        totalMonetaryImpact: spec.totalMonthlyImpact,
      })
    );

    const specUpdatedEvent = createEvent("build.spec.updated", event.pipelineRunId, {
        buildSpecId: buildSpec.id,
        version: newVersion,
        changesFromGapReport: "updated from call transcript",
      });
    await publishEvent(specUpdatedEvent);
    await pipelineQueue.add("build.spec.updated", specUpdatedEvent);
  } else {
    // first analysis for this call
    analysis = await prisma.analysis.create({
      data: {
        callId: event.data.callId,
        workflowMap: spec.workflowMap,
        gaps: spec.gaps,
        monetaryImpact: { total: spec.totalMonthlyImpact },
      },
    });

    buildSpec = await prisma.buildSpec.create({
      data: {
        analysisId: analysis.id,
        version: 1,
        uiRequirements: spec.prototype.pages,
        dataModels: spec.prototype.mockEndpoints,
        integrations: spec.prototype.simulatedIntegrations,
        walkthroughSteps: spec.prototype.walkthroughSteps,
      },
    });

    await publishEvent(
      createEvent("analysis.complete", event.pipelineRunId, {
        analysisId: analysis.id,
        gapCount: spec.gaps.length,
        totalMonetaryImpact: spec.totalMonthlyImpact,
      })
    );

    const specReadyEvent = createEvent("build.spec.ready", event.pipelineRunId, {
        buildSpecId: buildSpec.id,
        version: 1,
        pageCount: spec.prototype.pages.length,
      });
    await publishEvent(specReadyEvent);
    await pipelineQueue.add("build.spec.ready", specReadyEvent);
  }

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 2,
      label: "analyzing your workflow",
      subtitle: "finding the gaps that cost you money.",
    })
  );

  log.info({ analysisId: analysis.id, buildSpecId: buildSpec.id }, "analyst complete");
}

async function handleDesignQuestion(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  const { question, roundNumber } = event.data as {
    question: string;
    context: string;
    roundNumber: number;
  };

  log.info({ roundNumber }, "analyst answering builder design question");

  const workspace = await getWorkspace(event.pipelineRunId);

  const prompt = analystConsultationAnswerPrompt({
    transcriptPath: workspace.transcriptPath,
    currentSpecPath: workspace.buildSpecPath(1),
    question,
    roundNumber,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: 5 * 60 * 1000, // 5 min per consultation
    pipelineRunId: event.pipelineRunId,
  });

  // parse claude's json response from stdout
  let answer: string;
  try {
    const parsed = JSON.parse(result.output);
    // claude --output-format json wraps in { result: "..." }
    const inner = typeof parsed.result === "string" ? JSON.parse(parsed.result) : parsed;
    answer = inner.answer ?? result.output;
  } catch {
    answer = result.output;
  }

  await publishEvent(
    createEvent("build.design.answer", event.pipelineRunId, {
      answer,
      roundNumber,
    })
  );

  log.info({ roundNumber }, "analyst answered design question");
}

async function handleReviewComplete(event: SlushieEvent): Promise<void> {
  const log = createAgentLogger("analyst", event.pipelineRunId);
  const { version } = event.data as { version: number; gapReportId: string; coverageScore: number; gapCount: number };
  const newVersion = version + 1;

  log.info({ currentVersion: version, newVersion }, "analyst updating spec based on gap report");

  const workspace = await getWorkspace(event.pipelineRunId);

  // check for meeting notes
  const meetingNotesPath = `${workspace.root}/gap-meeting-notes.txt`;
  let hasMeetingNotes = false;
  try {
    const fsModule = await import("node:fs/promises");
    await fsModule.access(meetingNotesPath);
    hasMeetingNotes = true;
  } catch {}

  const prompt = analystSpecUpdatePrompt({
    currentSpecPath: workspace.buildSpecPath(version),
    gapReportPath: workspace.gapReportPath(version),
    meetingNotesPath: hasMeetingNotes ? meetingNotesPath : undefined,
    outputPath: workspace.buildSpecPath(newVersion),
    version: newVersion,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.analyst,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "analyst spec update completed");

  // read updated spec and save to database
  const specContent = await readWorkspaceFile(workspace.buildSpecPath(newVersion));
  const spec = JSON.parse(specContent);

  // find the analysis for this pipeline run
  const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: event.pipelineRunId },
    include: { call: { include: { analysis: true } } },
  });

  const analysisId = pipelineRun.call.analysis?.id;
  if (!analysisId) throw new Error("no analysis found for pipeline run");

  const buildSpec = await prisma.buildSpec.create({
    data: {
      analysisId,
      version: newVersion,
      uiRequirements: spec.prototype?.pages ?? spec.pages,
      dataModels: spec.prototype?.mockEndpoints ?? spec.mockEndpoints,
      integrations: spec.prototype?.simulatedIntegrations ?? spec.simulatedIntegrations,
      walkthroughSteps: spec.prototype?.walkthroughSteps ?? spec.walkthroughSteps,
    },
  });

  const specUpdatedEvent = createEvent("build.spec.updated", event.pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: newVersion,
      changesFromGapReport: `updated from gap report v${version}`,
    });
  await publishEvent(specUpdatedEvent);
  await pipelineQueue.add("build.spec.updated", specUpdatedEvent);

  log.info({ buildSpecId: buildSpec.id, version: newVersion }, "analyst spec update published");
}

async function handleIncrementalAnalysis(event: AnalystIncrementalEvent): Promise<void> {
  const { pipelineRunId } = event;
  const transcript = event.data.transcript;
  const log = createAgentLogger("analyst-incremental", pipelineRunId);

  log.info({ transcriptLength: transcript.length }, "starting incremental analysis");

  // load pipeline run with client context
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: {
      call: { include: { client: true } },
      client: true,
    },
  });

  if (!run) {
    log.error("pipeline run not found");
    return;
  }

  // load team directives for context
  const directives = run.teamDirectives as Array<{ text: string; timestamp: number; sentBy: string }> | null;
  let directivesContext = "";
  if (directives && directives.length > 0) {
    directivesContext = "\n\nTEAM MEMBER FEEDBACK:\n" + directives
      .map((d) => `[${new Date(d.timestamp).toISOString()}] ${d.sentBy}: ${d.text}`)
      .join("\n");
  }

  // set up workspace and write transcript
  const workspace = await getWorkspace(pipelineRunId);
  await writeWorkspaceFile(workspace.transcriptPath, transcript);

  const clientContext = `industry: ${run.call.client.industry}, name: ${run.call.client.name}`;
  const specOutputPath = workspace.buildSpecPath(1);

  const prompt = analystPrompt({
    transcriptPath: workspace.transcriptPath,
    coachingLogPath: workspace.coachingLogPath,
    clientContext,
    outputPath: specOutputPath,
  }) + directivesContext;

  // invoke claude code with analyst prompt + directives context
  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: 5 * 60 * 1000, // 5-minute timeout for incremental runs
    pipelineRunId,
  });

  // read and parse the spec file
  const specContent = await readWorkspaceFile(specOutputPath);
  const output = JSON.parse(specContent);

  // check for existing analysis to detect material changes
  const existingAnalysis = await prisma.analysis.findFirst({
    where: { callId: run.callId },
    include: { buildSpecs: { orderBy: { version: "desc" }, take: 1 } },
  });

  const currentSpec = existingAnalysis?.buildSpecs[0];
  const isFirstRun = !existingAnalysis;

  if (isFirstRun) {
    // first incremental run — create analysis + build spec v1
    const analysis = await prisma.analysis.create({
      data: {
        callId: run.callId,
        workflowMap: output.workflowMap ?? null,
        gaps: output.gaps ?? null,
        monetaryImpact: output.totalMonthlyImpact ? { total: output.totalMonthlyImpact } : undefined,
      },
    });

    const spec = output.prototype ?? output;
    const buildSpec = await prisma.buildSpec.create({
      data: {
        analysisId: analysis.id,
        version: 1,
        uiRequirements: spec.pages ?? null,
        dataModels: spec.mockEndpoints ?? null,
        integrations: spec.simulatedIntegrations ?? null,
        walkthroughSteps: spec.walkthroughSteps ?? null,
      },
    });

    await publishEvent(createEvent("analysis.complete", pipelineRunId, {
      analysisId: analysis.id,
      gapCount: (output.gaps as unknown[])?.length ?? 0,
      totalMonetaryImpact: output.totalMonthlyImpact ?? "$0",
    }));

    const specReadyEvent = createEvent("build.spec.ready", pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: 1,
      pageCount: (spec.pages as unknown[])?.length ?? 0,
    });
    await publishEvent(specReadyEvent);
    await pipelineQueue.add("build.spec.ready", specReadyEvent);

    log.info("first incremental analysis complete — spec v1 published");
  } else {
    // subsequent run — check for material changes
    const spec = output.prototype ?? output;
    const newPages = (spec.pages as unknown[]) ?? [];
    const newIntegrations = (spec.simulatedIntegrations as unknown[]) ?? [];
    const newGaps = (output.gaps as unknown[]) ?? [];

    const oldPages = (currentSpec?.uiRequirements as unknown[]) ?? [];
    const oldIntegrations = (currentSpec?.integrations as unknown[]) ?? [];
    const oldGaps = (existingAnalysis?.gaps as unknown[]) ?? [];

    const materialChange =
      newPages.length !== oldPages.length ||
      newIntegrations.length !== oldIntegrations.length ||
      newGaps.length !== oldGaps.length;

    if (materialChange) {
      const newVersion = (currentSpec?.version ?? 0) + 1;
      const buildSpec = await prisma.buildSpec.create({
        data: {
          analysisId: existingAnalysis!.id,
          version: newVersion,
          uiRequirements: spec.pages ?? null,
          dataModels: spec.mockEndpoints ?? null,
          integrations: spec.simulatedIntegrations ?? null,
          walkthroughSteps: spec.walkthroughSteps ?? null,
        },
      });

      // update analysis with latest gaps
      await prisma.analysis.update({
        where: { id: existingAnalysis!.id },
        data: {
          gaps: output.gaps ?? null,
          monetaryImpact: output.totalMonthlyImpact ? { total: output.totalMonthlyImpact } : undefined,
        },
      });

      await publishEvent(createEvent("analysis.complete", pipelineRunId, {
        analysisId: existingAnalysis!.id,
        gapCount: newGaps.length,
        totalMonetaryImpact: output.totalMonthlyImpact ?? "$0",
      }));

      const specUpdatedEvent = createEvent("build.spec.updated", pipelineRunId, {
        buildSpecId: buildSpec.id,
        version: newVersion,
        changesFromGapReport: `incremental update: pages ${oldPages.length}→${newPages.length}, integrations ${oldIntegrations.length}→${newIntegrations.length}, gaps ${oldGaps.length}→${newGaps.length}`,
      });
      await publishEvent(specUpdatedEvent);
      await pipelineQueue.add("build.spec.updated", specUpdatedEvent);

      log.info({ newVersion, materialChange: true }, "incremental analysis complete — spec updated");
    } else {
      log.info("incremental analysis complete — no material changes, skipping spec update");
    }
  }
}
