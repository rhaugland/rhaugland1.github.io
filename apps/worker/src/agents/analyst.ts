import { Worker, Job } from "bullmq";
import { prisma } from "@slushie/db";
import { createEvent, type CallEndedEvent, type SlushieEvent } from "@slushie/events";
import { analystPrompt, analystConsultationAnswerPrompt, analystSpecUpdatePrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, writeWorkspaceFile, readWorkspaceFile } from "./workspace";
import { PHASE_TIMEOUTS } from "../queues";

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
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
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

  // save to database
  const analysis = await prisma.analysis.create({
    data: {
      callId: event.data.callId,
      workflowMap: spec.workflowMap,
      gaps: spec.gaps,
      monetaryImpact: { total: spec.totalMonthlyImpact },
    },
  });

  const buildSpec = await prisma.buildSpec.create({
    data: {
      analysisId: analysis.id,
      version: 1,
      uiRequirements: spec.prototype.pages,
      dataModels: spec.prototype.mockEndpoints,
      integrations: spec.prototype.simulatedIntegrations,
      walkthroughSteps: spec.prototype.walkthroughSteps,
    },
  });

  // publish events
  await publishEvent(
    createEvent("analysis.complete", event.pipelineRunId, {
      analysisId: analysis.id,
      gapCount: spec.gaps.length,
      totalMonetaryImpact: spec.totalMonthlyImpact,
    })
  );

  await publishEvent(
    createEvent("build.spec.ready", event.pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: 1,
      pageCount: spec.prototype.pages.length,
    })
  );

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

  const prompt = analystSpecUpdatePrompt({
    currentSpecPath: workspace.buildSpecPath(version),
    gapReportPath: workspace.gapReportPath(version),
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

  await publishEvent(
    createEvent("build.spec.updated", event.pipelineRunId, {
      buildSpecId: buildSpec.id,
      version: newVersion,
      changesFromGapReport: `updated from gap report v${version}`,
    })
  );

  log.info({ buildSpecId: buildSpec.id, version: newVersion }, "analyst spec update published");
}
