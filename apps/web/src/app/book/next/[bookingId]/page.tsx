import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { NextWorkflowForm } from "./next-workflow-form";

const PLAN_WORKFLOW_COUNT: Record<string, number> = {
  SINGLE_SCOOP: 1,
  DOUBLE_BLEND: 2,
  TRIPLE_FREEZE: 3,
};

const PLAN_LABELS: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

export const metadata: Metadata = {
  title: "slushie — schedule your next workflow",
  description: "book your next workflow session.",
};

export default async function NextWorkflowPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      name: true,
      email: true,
      businessName: true,
      plan: true,
      workflowNumber: true,
      status: true,
    },
  });

  if (!booking) {
    notFound();
  }

  const totalWorkflows = PLAN_WORKFLOW_COUNT[booking.plan] ?? 1;
  const nextWorkflow = booking.workflowNumber + 1;

  // check if already scheduled
  const existingNext = await prisma.booking.findFirst({
    where: { parentBookingId: booking.id },
    select: { id: true },
  });

  if (existingNext) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-6 rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6">
            <p className="text-sm font-bold text-foreground">workflow already scheduled!</p>
            <p className="mt-2 text-xs text-muted">
              your next workflow is already booked. check your email for updates on its progress.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (nextWorkflow > totalWorkflows) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-6 rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6">
            <p className="text-sm font-bold text-foreground">all workflows complete!</p>
            <p className="mt-2 text-xs text-muted">
              you've used all {totalWorkflows} workflows included in your {PLAN_LABELS[booking.plan]} plan. thanks for choosing slushie!
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (booking.status !== "COMPLETED") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">slushie</h1>
          <div className="mt-6 rounded-2xl bg-surface shadow-lg backdrop-blur-sm p-6">
            <p className="text-sm font-bold text-foreground">not quite ready yet</p>
            <p className="mt-2 text-xs text-muted">
              your current workflow needs to be completed before scheduling the next one.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <NextWorkflowForm
      bookingId={booking.id}
      name={booking.name}
      businessName={booking.businessName}
      planLabel={PLAN_LABELS[booking.plan] ?? booking.plan}
      workflowNumber={nextWorkflow}
      totalWorkflows={totalWorkflows}
    />
  );
}
