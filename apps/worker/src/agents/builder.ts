import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type BuildSpecReadyEvent,
  type BuildDesignAnswerEvent,
  type BuildSpecUpdatedEvent,
  type SlushieEvent,
} from "@slushie/events";
import { builderPrompt, builderPatchPrompt, uiPolisherPrompt } from "@slushie/agents";
import fs from "node:fs/promises";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, readWorkspaceFile } from "./workspace";
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

// track consultation state per pipeline run
const consultationState = new Map<
  string,
  {
    roundNumber: number;
    maxRounds: number;
    pendingAnswer: ((answer: string) => void) | null;
  }
>();

export function createBuilderWorker() {
  return new Worker<SlushieEvent>(
    "builder",
    async (job: Job<SlushieEvent>) => {
      const event = job.data;

      if (event.type === "build.spec.ready") {
        await handleBuildSpecReady(event as BuildSpecReadyEvent);
      } else if (event.type === "build.design.answer") {
        handleDesignAnswer(event as BuildDesignAnswerEvent);
      } else if (event.type === "build.spec.updated") {
        await handleBuildSpecUpdated(event as BuildSpecUpdatedEvent);
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

async function handleBuildSpecReady(event: BuildSpecReadyEvent): Promise<void> {
  const log = createAgentLogger("builder", event.pipelineRunId);
  log.info({ buildSpecId: event.data.buildSpecId, version: event.data.version }, "builder starting initial build (HTML mode)");

  // update tracker
  await publishEvent(
    createEvent("tracker.update", event.pipelineRunId, {
      step: 3,
      label: "building your prototype",
      subtitle: "pouring the ingredients together.",
    })
  );

  // initialize consultation state
  consultationState.set(event.pipelineRunId, {
    roundNumber: 0,
    maxRounds: 15,
    pendingAnswer: null,
  });

  const workspace = await getWorkspace(event.pipelineRunId);
  const version = event.data.version;
  const specPath = workspace.buildSpecPath(version);
  const htmlOutputPath = workspace.htmlPath(version);
  const decisionLogPath = workspace.decisionLogPath(version);

  // --- Phase 1: Build the prototype HTML ---
  const prompt = builderPrompt({
    buildSpecPath: specPath,
    outputHtmlPath: htmlOutputPath,
    outputDecisionLogPath: decisionLogPath,
    prototypeDir: workspace.root,
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder HTML generation completed");

  // read the generated HTML
  let htmlBundle: string;
  try {
    htmlBundle = await readWorkspaceFile(htmlOutputPath);
  } catch (err) {
    log.error(err, "builder: failed to read generated HTML — falling back to empty");
    htmlBundle = "<html><body><h1>Build failed — no HTML generated</h1></body></html>";
  }

  // read decision log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let decisionLog: any[] = [];
  try {
    const logContent = await readWorkspaceFile(decisionLogPath);
    decisionLog = JSON.parse(logContent);
  } catch {
    log.warn("builder: no decision log found, using empty array");
  }

  // --- Phase 2: UI polisher pass ---
  const clientName = await getClientName(event.pipelineRunId);
  const polishedHtmlPath = `${workspace.root}/prototype-v${version}-polished.html`;

  try {
    const polishPrompt = uiPolisherPrompt({
      htmlPath: htmlOutputPath,
      outputHtmlPath: polishedHtmlPath,
      clientBusinessName: clientName,
      version,
    });

    const polishResult = await invokeClaudeCode({
      prompt: polishPrompt,
      workingDirectory: workspace.root,
      timeoutMs: 10 * 60 * 1000, // 10 min for polish pass
      pipelineRunId: event.pipelineRunId,
    });

    log.info({ exitCode: polishResult.exitCode }, "UI polisher completed");

    // use polished version if it exists
    try {
      htmlBundle = await readWorkspaceFile(polishedHtmlPath);
      log.info("using polished HTML output");
    } catch {
      log.warn("polished HTML not found, using original builder output");
    }
  } catch (polishErr) {
    log.warn(polishErr, "UI polisher failed, using original builder output");
  }

  // read integration credentials if they were created
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let integrationCredentials: any = null;
  try {
    const credsPath = `${workspace.root}/integration-credentials-v${version}.json`;
    const credsContent = await readWorkspaceFile(credsPath);
    integrationCredentials = JSON.parse(credsContent);
    log.info({ integrationCount: integrationCredentials?.integrations?.length ?? 0 }, "loaded integration credentials");
  } catch {
    log.info("no integration credentials file found (ok if no integrations in spec)");
  }

  // save to database
  const buildSpec = await prisma.buildSpec.findFirstOrThrow({
    where: { id: event.data.buildSpecId },
  });

  const previewUrl = `/preview/${event.pipelineRunId}`;
  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      htmlBundle,
      integrationCredentials,
      decisionLog,
      previewUrl,
    },
  });

  // publish prototype.ready
  const protoReadyEvent = createEvent("prototype.ready", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      previewUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
    });
  await publishEvent(protoReadyEvent);
  await pipelineQueue.add("prototype.ready", protoReadyEvent);

  // cleanup consultation state
  consultationState.delete(event.pipelineRunId);

  log.info({ prototypeId: prototype.id, version }, "builder initial build complete (HTML mode)");
}

function handleDesignAnswer(event: BuildDesignAnswerEvent): void {
  const state = consultationState.get(event.pipelineRunId);
  if (state?.pendingAnswer) {
    state.pendingAnswer(event.data.answer);
    state.pendingAnswer = null;
  }
}

async function handleBuildSpecUpdated(event: BuildSpecUpdatedEvent): Promise<void> {
  const log = createAgentLogger("builder", event.pipelineRunId);
  const version = event.data.version;
  log.info({ version }, "builder patching prototype (HTML mode)");

  const workspace = await getWorkspace(event.pipelineRunId);
  const previousVersion = version - 1;

  // only pass gap report path if the file actually exists
  const gapReportPath = workspace.gapReportPath(previousVersion);
  let hasGapReport = false;
  try {
    await fs.access(gapReportPath);
    hasGapReport = true;
  } catch {}

  // check for meeting notes
  const meetingNotesPath = `${workspace.root}/gap-meeting-notes.txt`;
  let hasMeetingNotes = false;
  try {
    await fs.access(meetingNotesPath);
    hasMeetingNotes = true;
  } catch {}

  const htmlOutputPath = workspace.htmlPath(version);
  const decisionLogPath = workspace.decisionLogPath(version);

  // --- Phase 1: Build the patched HTML ---
  const prompt = builderPatchPrompt({
    currentHtmlPath: workspace.htmlPath(previousVersion),
    updatedSpecPath: workspace.buildSpecPath(version),
    gapReportPath: hasGapReport ? gapReportPath : undefined,
    meetingNotesPath: hasMeetingNotes ? meetingNotesPath : undefined,
    outputHtmlPath: htmlOutputPath,
    outputDecisionLogPath: decisionLogPath,
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder patch HTML generation completed");

  // read patched HTML
  let htmlBundle: string;
  try {
    htmlBundle = await readWorkspaceFile(htmlOutputPath);
  } catch (err) {
    log.error(err, "builder: failed to read patched HTML");
    htmlBundle = "<html><body><h1>Patch build failed</h1></body></html>";
  }

  // read decision log
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let decisionLog: any[] = [];
  try {
    const logContent = await readWorkspaceFile(decisionLogPath);
    decisionLog = JSON.parse(logContent);
  } catch {
    log.warn("builder: no decision log for patch, using empty array");
  }

  // --- Phase 2: UI polisher pass ---
  const clientName = await getClientName(event.pipelineRunId);
  const polishedHtmlPath = `${workspace.root}/prototype-v${version}-polished.html`;

  try {
    const polishPrompt = uiPolisherPrompt({
      htmlPath: htmlOutputPath,
      outputHtmlPath: polishedHtmlPath,
      clientBusinessName: clientName,
      version,
    });

    const polishResult = await invokeClaudeCode({
      prompt: polishPrompt,
      workingDirectory: workspace.root,
      timeoutMs: 10 * 60 * 1000,
      pipelineRunId: event.pipelineRunId,
    });

    log.info({ exitCode: polishResult.exitCode }, "UI polisher (patch) completed");

    try {
      htmlBundle = await readWorkspaceFile(polishedHtmlPath);
      log.info("using polished HTML output for patch");
    } catch {
      log.warn("polished HTML not found for patch, using original");
    }
  } catch (polishErr) {
    log.warn(polishErr, "UI polisher (patch) failed, using original");
  }

  // find the build spec for this version
  const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: event.pipelineRunId },
    include: { call: { include: { analysis: { include: { buildSpecs: true } } } } },
  });

  const buildSpec = pipelineRun.call.analysis?.buildSpecs.find(
    (s) => s.version === version
  );
  if (!buildSpec) throw new Error(`no build spec found for version ${version}`);

  // read integration credentials
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let integrationCredentials: any = null;
  try {
    const credsPath = `${workspace.root}/integration-credentials-v${version}.json`;
    const credsContent = await readWorkspaceFile(credsPath);
    integrationCredentials = JSON.parse(credsContent);
    log.info({ integrationCount: integrationCredentials?.integrations?.length ?? 0 }, "loaded patch integration credentials");
  } catch {
    log.info("no integration credentials for patch (ok)");
  }

  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      htmlBundle,
      integrationCredentials,
      decisionLog,
      previewUrl: `/preview/${event.pipelineRunId}`,
    },
  });

  const protoPatchedEvent = createEvent("prototype.patched", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      patchSummary: `patched from gap report v${previousVersion}`,
    });
  await publishEvent(protoPatchedEvent);
  await pipelineQueue.add("prototype.patched", protoPatchedEvent);

  log.info({ prototypeId: prototype.id, version }, "builder patch complete (HTML mode)");
}

async function getClientName(pipelineRunId: string): Promise<string> {
  try {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      include: { client: { select: { name: true } } },
    });
    return run?.client.name ?? "Client";
  } catch {
    return "Client";
  }
}
