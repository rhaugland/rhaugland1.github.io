import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

const prisma = new PrismaClient();

const BOOKING_ID = "cmms0ulml000ps9rn2lowp37x";
const EMPLOYEE_ID = "emp_ryan";

async function main() {
  const booking = await prisma.booking.findUnique({
    where: { id: BOOKING_ID },
    include: { tracker: true },
  });

  if (!booking) {
    console.error("booking not found");
    process.exit(1);
  }

  console.log("booking:", booking.businessName, booking.name);

  // claim it
  await prisma.booking.update({
    where: { id: BOOKING_ID },
    data: { assigneeId: EMPLOYEE_ID },
  });
  console.log("claimed by", EMPLOYEE_ID);

  // ensure client exists
  let clientId = booking.clientId;
  if (!clientId) {
    const client = await prisma.client.create({
      data: {
        name: booking.businessName,
        industry: "pending",
        contactName: booking.name,
        contactEmail: booking.email,
      },
    });
    clientId = client.id;
    await prisma.booking.update({
      where: { id: BOOKING_ID },
      data: { clientId },
    });
    console.log("created client:", clientId);
  }

  // create call record
  const call = await prisma.call.create({
    data: {
      clientId,
      startedAt: new Date(),
      endedAt: new Date(),
      transcript: booking.description,
      coachingLog: [],
    },
  });
  console.log("created call:", call.id);

  // create pipeline run
  const pipelineRun = await prisma.pipelineRun.create({
    data: {
      clientId,
      callId: call.id,
      status: "RUNNING",
    },
  });
  console.log("created pipeline run:", pipelineRun.id);

  // link to tracker
  if (booking.tracker) {
    await prisma.tracker.update({
      where: { id: booking.tracker.id },
      data: { pipelineRunId: pipelineRun.id },
    });
    console.log("linked tracker");
  }

  // dispatch call.ended to pipeline queue
  const queue = new Queue("pipeline", {
    connection: { host: "localhost", port: 6379 },
  });

  await queue.add("call.ended", {
    type: "call.ended",
    pipelineRunId: pipelineRun.id,
    timestamp: Date.now(),
    data: {
      callId: call.id,
      clientId,
      duration: 0,
    },
  });
  console.log("dispatched call.ended event to pipeline queue");

  await queue.close();
  await prisma.$disconnect();
  console.log("done - watch worker logs for pipeline progress");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
