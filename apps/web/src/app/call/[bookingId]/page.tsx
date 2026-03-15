import { prisma } from "@slushie/db";
import { notFound } from "next/navigation";

export default async function CustomerCallPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      tracker: {
        select: { slug: true, currentStep: true, pipelineRunId: true },
      },
    },
  });

  if (!booking) notFound();

  const meetingLabel = booking.meetingTime.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const isMeetingDay =
    booking.meetingTime.toDateString() === new Date().toDateString();

  // advance tracker to step 2 if still at step 1
  if (booking.tracker && booking.tracker.currentStep <= 1 && isMeetingDay) {
    const tracker = await prisma.tracker.findUnique({
      where: { bookingId },
      select: { id: true, steps: true },
    });

    if (tracker) {
      const steps = tracker.steps as Array<{
        step: number; label: string; subtitle: string; status: string; completedAt: string | null;
      }>;
      const updatedSteps = steps.map((s, i) => ({
        ...s,
        status: i <= 1 ? "done" : i === 2 ? "active" : s.status,
        completedAt: i === 1 && s.status !== "done" ? new Date().toISOString() : s.completedAt,
      }));

      await prisma.tracker.update({
        where: { id: tracker.id },
        data: { currentStep: 2, steps: updatedSteps },
      });
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-extrabold text-primary">slushie</h1>
        <p className="mt-2 text-sm text-muted">blend session</p>

        <div className="mt-8 rounded-2xl bg-white/80 shadow-lg backdrop-blur-sm p-6">
          {isMeetingDay ? (
            <>
              <div className="flex items-center justify-center gap-2 mb-4">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary" />
                <span className="text-sm font-semibold text-foreground">
                  you're connected
                </span>
              </div>

              <p className="text-lg font-bold text-foreground">
                {booking.businessName}
              </p>
              <p className="text-sm text-muted mt-1">{booking.name}</p>

              <div className="mt-4 rounded-lg bg-gradient-to-r from-primary/5 to-secondary/5 border border-primary/15 px-4 py-3">
                <p className="text-xs text-muted">meeting time</p>
                <p className="text-sm font-bold text-foreground mt-0.5">
                  {meetingLabel}
                </p>
              </div>

              <div className="mt-6 space-y-3">
                <p className="text-xs text-muted">
                  your slushie team member will start the call shortly.
                  <br />
                  stay on this page — we're building your tool live.
                </p>

                <div className="flex items-center justify-center gap-1.5 text-xs text-primary font-medium">
                  <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  listening for updates...
                </div>
              </div>

              {booking.tracker?.slug && (
                <a
                  href={`/track/${booking.tracker.slug}`}
                  className="mt-4 block text-xs text-muted hover:text-primary transition-colors"
                >
                  view your tracker
                </a>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-muted">
                your call isn't until
              </p>
              <p className="text-lg font-bold text-foreground mt-1">
                {meetingLabel}
              </p>
              <p className="mt-4 text-xs text-muted">
                come back on the day of your meeting to join.
              </p>
              {booking.tracker?.slug && (
                <a
                  href={`/track/${booking.tracker.slug}`}
                  className="mt-4 inline-block rounded-lg border-2 border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
                >
                  view your tracker
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-muted/60">
        <p>powered by slushie</p>
      </div>
    </main>
  );
}
