import pino from "pino";

export const logger = pino({
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty" }
      : undefined,
});

export function createAgentLogger(agentType: string, pipelineRunId: string) {
  return logger.child({ agentType, pipelineRunId });
}
