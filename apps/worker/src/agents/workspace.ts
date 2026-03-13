import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? "/tmp/slushie-workspaces";

export interface PipelineWorkspace {
  root: string;
  transcriptPath: string;
  coachingLogPath: string;
  buildSpecPath: (version: number) => string;
  manifestPath: (version: number) => string;
  gapReportPath: (version: number) => string;
  decisionLogPath: (version: number) => string;
}

export async function createWorkspace(pipelineRunId: string): Promise<PipelineWorkspace> {
  const root = join(WORKSPACE_ROOT, pipelineRunId);
  await mkdir(root, { recursive: true });

  return {
    root,
    transcriptPath: join(root, "transcript.txt"),
    coachingLogPath: join(root, "coaching-log.json"),
    buildSpecPath: (v: number) => join(root, `build-spec-v${v}.json`),
    manifestPath: (v: number) => join(root, `manifest-v${v}.json`),
    gapReportPath: (v: number) => join(root, `gap-report-v${v}.json`),
    decisionLogPath: (v: number) => join(root, `decision-log-v${v}.json`),
  };
}

export async function getWorkspace(pipelineRunId: string): Promise<PipelineWorkspace> {
  const root = join(WORKSPACE_ROOT, pipelineRunId);
  if (!existsSync(root)) {
    return createWorkspace(pipelineRunId);
  }
  return {
    root,
    transcriptPath: join(root, "transcript.txt"),
    coachingLogPath: join(root, "coaching-log.json"),
    buildSpecPath: (v: number) => join(root, `build-spec-v${v}.json`),
    manifestPath: (v: number) => join(root, `manifest-v${v}.json`),
    gapReportPath: (v: number) => join(root, `gap-report-v${v}.json`),
    decisionLogPath: (v: number) => join(root, `decision-log-v${v}.json`),
  };
}

export async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  await writeFile(path, content, "utf-8");
}

export async function readWorkspaceFile(path: string): Promise<string> {
  return readFile(path, "utf-8");
}
