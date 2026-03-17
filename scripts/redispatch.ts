import { Queue } from "bullmq";

const PIPELINE_RUN_ID = "cmms10guw0003s97uhmekgox9";
const CALL_ID = "cmms10guu0001s97umhvmvqbs";
const CLIENT_ID = "cmms0ullu000ns9rn53bam2h0";

async function main() {
  const queue = new Queue("pipeline", {
    connection: { host: "localhost", port: 6379 },
  });

  await queue.add("call.ended", {
    type: "call.ended",
    pipelineRunId: PIPELINE_RUN_ID,
    timestamp: Date.now(),
    data: {
      callId: CALL_ID,
      clientId: CLIENT_ID,
      duration: 0,
    },
  });

  console.log("dispatched call.ended to pipeline queue");
  await queue.close();
}

main().catch(console.error);
