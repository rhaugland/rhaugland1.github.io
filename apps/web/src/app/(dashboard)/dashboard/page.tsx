import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingCard } from "./booking-card";
import { ReviewAlert } from "./review-alert";
import { SeedButton } from "./seed-button";

const BOOKING_STEP_LABELS = [
  "meeting confirmed",
  "meeting",
  "slushie build review",
  "client build approval",
  "plug-in",
  "billing",
  "satisfaction survey",
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin?callbackUrl=/dashboard");

  const userEmail = session.user?.email ?? "";

  // find the employee record matching the logged-in user
  const currentEmployee = await prisma.employee.findFirst({
    where: {
      email: { equals: userEmail, mode: "insensitive" },
    },
  });

  const bookings = await prisma.booking.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { meetingTime: "asc" },
    include: {
      tracker: {
        select: {
          id: true,
          slug: true,
          currentStep: true,
          steps: true,
          clientFeedback: true,
          revisionStatus: true,
          pluginCredentials: true,
          pluginStatus: true,
          paidAt: true,
          npsScore: true,
          pipelineRun: {
            select: {
              id: true,
              status: true,
              call: {
                select: {
                  analysis: {
                    select: {
                      buildSpecs: {
                        orderBy: { version: "desc" },
                        take: 1,
                        select: {
                          prototypes: {
                            orderBy: { version: "desc" },
                            take: 1,
                            select: { id: true, previewUrl: true, version: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      assignee: { select: { id: true, name: true } },
    },
  });

  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
  });

  const planLabels: Record<string, string> = {
    SINGLE_SCOOP: "single scoop",
    DOUBLE_BLEND: "double blend",
    TRIPLE_FREEZE: "triple freeze",
  };

  // auto-advance: move step 1 bookings to step 2 if meeting day has arrived
  const today = new Date().toDateString();
  for (const booking of bookings) {
    if (
      booking.tracker &&
      booking.tracker.currentStep === 1 &&
      booking.assigneeId &&
      booking.meetingTime.toDateString() === today
    ) {
      const steps = booking.tracker.steps as Array<{
        step: number; label: string; subtitle: string; status: string; completedAt: string | null;
      }>;
      const updatedSteps = steps.map((s, i) => ({
        ...s,
        status: i === 0 ? "done" : i === 1 ? "active" : s.status,
        completedAt: i === 0 && s.status !== "done" ? new Date().toISOString() : s.completedAt,
      }));

      await prisma.tracker.update({
        where: { id: booking.tracker.id },
        data: { currentStep: 2, steps: updatedSteps },
      });

      // update in-memory so the page renders correctly
      booking.tracker.currentStep = 2;
      (booking.tracker as { steps: unknown }).steps = updatedSteps;
    }
  }

  // filter: show my claimed bookings + unclaimed. hide other people's claimed bookings.
  const reviewBookings = currentEmployee
    ? bookings.filter((b) => b.assigneeId === currentEmployee.id && b.needsReview)
    : [];

  const visibleBookings = bookings.filter(
    (b) =>
      !b.needsReview &&
      (!b.assigneeId || (currentEmployee && b.assigneeId === currentEmployee.id))
  );

  function getBuildStatus(booking: (typeof bookings)[number]): {
    status: "none" | "analyzing" | "building" | "ready";
    previewUrl?: string;
  } {
    const run = booking.tracker?.pipelineRun;
    if (!run) return { status: "none" };

    const prototype = run.call?.analysis?.buildSpecs?.[0]?.prototypes?.[0];
    if (prototype?.previewUrl) {
      return { status: "ready", previewUrl: prototype.previewUrl };
    }

    const hasBuildSpec = (run.call?.analysis?.buildSpecs?.length ?? 0) > 0;
    if (hasBuildSpec) return { status: "building" };

    return { status: "analyzing" };
  }

  // group visible bookings by step
  const columns = BOOKING_STEP_LABELS.map((label, i) => {
    const step = i + 1;
    return {
      step,
      label,
      bookings: visibleBookings.filter((b) => (b.tracker?.currentStep ?? 0) === step),
    };
  });

  const totalVisible = visibleBookings.length;

  return (
    <div>
      {/* reschedule notifications */}
      {reviewBookings.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <h2 className="text-lg font-extrabold text-foreground">needs your attention</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {reviewBookings.length}
            </span>
          </div>
          <div className="space-y-3">
            {reviewBookings.map((booking) => (
              <ReviewAlert
                key={booking.id}
                id={booking.id}
                businessName={booking.businessName}
                name={booking.name}
                plan={planLabels[booking.plan] ?? booking.plan}
                meetingTime={booking.meetingTime.toISOString()}
              />
            ))}
          </div>
        </div>
      )}

      {/* unified kanban board */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">meetings</h1>
            <p className="mt-1 text-sm text-muted">
              {totalVisible > 0
                ? "your bookings and unclaimed work, organized by step"
                : "no bookings yet"}
            </p>
          </div>
          <SeedButton />
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.step}
              className="flex-shrink-0 w-72 rounded-xl bg-gray-50 border border-gray-200"
            >
              {/* column header */}
              <div className="sticky top-0 px-3 py-3 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">
                    {col.step}. {col.label}
                  </p>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold text-muted">
                    {col.bookings.length}
                  </span>
                </div>
              </div>

              {/* cards */}
              <div className="p-2 space-y-2 min-h-[120px]">
                {col.bookings.length === 0 && (
                  <p className="text-center text-xs text-muted/50 py-8">
                    no bookings
                  </p>
                )}
                {col.bookings.map((booking) => {
                  const build = getBuildStatus(booking);
                  return (
                    <BookingCard
                      key={booking.id}
                      id={booking.id}
                      name={booking.name}
                      businessName={booking.businessName}
                      plan={planLabels[booking.plan] ?? booking.plan}
                      meetingTime={booking.meetingTime.toISOString()}
                      trackingSlug={booking.tracker?.slug ?? null}
                      assignee={booking.assignee}
                      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
                      buildStatus={build.status}
                      buildPreviewUrl={build.previewUrl}
                      pipelineRunId={booking.tracker?.pipelineRun?.id ?? null}
                      currentStep={booking.tracker?.currentStep ?? 0}
                      clientFeedback={booking.tracker?.clientFeedback ?? null}
                      revisionStatus={booking.tracker?.revisionStatus ?? null}
                      pluginCredentials={(booking.tracker?.pluginCredentials as Array<{ service: string; value: string }>) ?? null}
                      pluginStatus={booking.tracker?.pluginStatus ?? null}
                      isPaid={!!booking.tracker?.paidAt}
                      npsScore={booking.tracker?.npsScore ?? null}
                      freeAddonEarned={booking.freeAddonEarned}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
