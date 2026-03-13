import { Worker, Job, Queue } from "bullmq";
import { prisma } from "@slushie/db";
import {
  createEvent,
  type BuildSpecReadyEvent,
  type BuildDesignAnswerEvent,
  type BuildSpecUpdatedEvent,
  type SlushieEvent,
} from "@slushie/events";
import { builderPrompt, builderPatchPrompt } from "@slushie/agents";
import { invokeClaudeCode } from "../claude";
import { publishEvent } from "../publish";
import { createAgentLogger } from "../logger";
import { getWorkspace, readWorkspaceFile } from "./workspace";
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
    }
  );
}

async function handleBuildSpecReady(event: BuildSpecReadyEvent): Promise<void> {
  const log = createAgentLogger("builder", event.pipelineRunId);
  log.info({ buildSpecId: event.data.buildSpecId, version: event.data.version }, "builder starting initial build");

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
  const manifestPath = workspace.manifestPath(version);

  const prompt = builderPrompt({
    buildSpecPath: specPath,
    outputManifestPath: manifestPath,
    prototypeDir: workspace.root,
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder claude code session completed");

  // read the manifest
  const manifestContent = await readWorkspaceFile(manifestPath);
  const manifest = JSON.parse(manifestContent);

  // save to database
  const buildSpec = await prisma.buildSpec.findFirstOrThrow({
    where: { id: event.data.buildSpecId },
  });

  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      manifest,
      decisionLog: manifest.decisionLog ?? [],
    },
  });

  // publish prototype.ready
  await publishEvent(
    createEvent("prototype.ready", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      previewUrl: `app.slushie.agency/preview/${event.pipelineRunId}`,
    })
  );

  // cleanup consultation state
  consultationState.delete(event.pipelineRunId);

  log.info({ prototypeId: prototype.id, version }, "builder initial build complete");
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
  log.info({ version }, "builder patching prototype from updated spec");

  const workspace = await getWorkspace(event.pipelineRunId);
  const previousVersion = version - 1;

  const prompt = builderPatchPrompt({
    currentManifestPath: workspace.manifestPath(previousVersion),
    updatedSpecPath: workspace.buildSpecPath(version),
    gapReportPath: workspace.gapReportPath(previousVersion),
    outputManifestPath: workspace.manifestPath(version),
    version,
  });

  const result = await invokeClaudeCode({
    prompt,
    workingDirectory: workspace.root,
    timeoutMs: PHASE_TIMEOUTS.builder,
    pipelineRunId: event.pipelineRunId,
  });

  log.info({ exitCode: result.exitCode }, "builder patch session completed");

  // read patched manifest
  const manifestContent = await readWorkspaceFile(workspace.manifestPath(version));
  const manifest = JSON.parse(manifestContent);

  // find the build spec for this version
  const pipelineRun = await prisma.pipelineRun.findUniqueOrThrow({
    where: { id: event.pipelineRunId },
    include: { call: { include: { analysis: { include: { buildSpecs: true } } } } },
  });

  const buildSpec = pipelineRun.call.analysis?.buildSpecs.find(
    (s) => s.version === version
  );
  if (!buildSpec) throw new Error(`no build spec found for version ${version}`);

  const prototype = await prisma.prototype.create({
    data: {
      buildSpecId: buildSpec.id,
      version,
      manifest,
      decisionLog: manifest.decisionLog ?? [],
    },
  });

  await publishEvent(
    createEvent("prototype.patched", event.pipelineRunId, {
      prototypeId: prototype.id,
      version,
      patchSummary: `patched from gap report v${previousVersion}`,
    })
  );

  log.info({ prototypeId: prototype.id, version }, "builder patch complete");
}
