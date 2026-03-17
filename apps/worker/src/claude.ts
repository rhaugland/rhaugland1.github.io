import { spawn } from "node:child_process";
import { logger } from "./logger";

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

  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("CLAUDE"))
  );

  return new Promise<ClaudeCodeResult>((resolve, reject) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--output-format", "json", "--dangerously-skip-permissions"],
      {
        cwd: workingDirectory,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      agentLogger.error({ error: err.message }, "claude code spawn error");
      reject(err);
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        agentLogger.error(
          { timeoutMs },
          "claude code session timed out or was killed"
        );
        reject(new Error(`claude code timed out after ${timeoutMs}ms`));
        return;
      }

      if (code !== 0) {
        agentLogger.error(
          { exitCode: code, stderr },
          "claude code session failed"
        );
        reject(new Error(`claude code exited with code ${code}: ${stderr}`));
        return;
      }

      if (stderr) {
        agentLogger.warn({ stderr }, "claude code stderr output");
      }

      agentLogger.info(
        { outputLength: stdout.length },
        "claude code completed"
      );

      resolve({ output: stdout, stderr, exitCode: 0 });
    });
  });
}
