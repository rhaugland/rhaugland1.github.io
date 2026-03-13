import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

interface ClaudeCodeOptions {
  prompt: string;
  workingDirectory: string;
  timeoutMs: number; // required — caller must pass the appropriate phase timeout
  pipelineRunId?: string;
}

interface ClaudeCodeResult {
  output: string;
  stderr: string;
  exitCode: number;
}

export async function invokeClaudeCode(
  options: ClaudeCodeOptions
): Promise<ClaudeCodeResult> {
  const { prompt, workingDirectory, timeoutMs, pipelineRunId } = options;

  const agentLogger = pipelineRunId
    ? logger.child({ pipelineRunId })
    : logger;

  agentLogger.info(
    { workingDirectory, promptLength: prompt.length, timeoutMs },
    "invoking claude code"
  );

  try {
    const { stdout, stderr } = await execFileAsync(
      "claude",
      ["-p", prompt, "--output-format", "json"],
      {
        cwd: workingDirectory,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10mb
        env: { ...process.env },
      }
    );

    if (stderr) {
      agentLogger.warn({ stderr }, "claude code stderr output");
    }

    agentLogger.info(
      { outputLength: stdout.length },
      "claude code completed"
    );

    return { output: stdout, stderr: stderr || "", exitCode: 0 };
  } catch (error: unknown) {
    const err = error as {
      code?: number | string;
      killed?: boolean;
      stderr?: string;
      signal?: string;
    };

    if (err.killed) {
      agentLogger.error(
        { signal: err.signal, timeoutMs },
        "claude code session timed out or was killed"
      );
      throw new Error(`claude code timed out after ${timeoutMs}ms`);
    }

    agentLogger.error(
      { exitCode: err.code, stderr: err.stderr },
      "claude code session failed"
    );
    throw error;
  }
}
