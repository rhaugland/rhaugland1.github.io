import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingCard } from "./booking-card";
import { ReviewAlert } from "./review-alert";

const BOOKING_STEP_LABELS = [
  "meeting confirmed",
  "meeting",
  "build completion",
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
          slug: true,
          currentStep: true,
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

  // split bookings into categories
  const myBookings = currentEmployee
    ? bookings.filter((b) => b.assigneeId === currentEmployee.id && !b.needsReview)
    : [];
  const reviewBookings = currentEmployee
    ? bookings.filter((b) => b.assigneeId === currentEmployee.id && b.needsReview)
    : [];
  const unclaimedBookings = bookings.filter((b) => !b.assigneeId);

  // group unclaimed by current step
  const columns = BOOKING_STEP_LABELS.map((label, i) => {
    const step = i + 1;
    return {
      step,
      label,
      bookings: unclaimedBookings.filter((b) => (b.tracker?.currentStep ?? 0) === step),
    };
  });

  const hasUnclaimed = unclaimedBookings.length > 0;

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

      {/* my meetings */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">my meetings</h1>
        <p className="mt-1 text-sm text-muted">
          bookings you've claimed, ordered by meeting date
        </p>

        {myBookings.length === 0 ? (
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-6 py-10 text-center">
            <p className="text-sm text-muted">no claimed bookings yet — grab one from below</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {myBookings.map((booking) => {
              const currentStep = booking.tracker?.currentStep ?? 0;
              const stepLabel = BOOKING_STEP_LABELS[currentStep - 1] ?? "";
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
                  stepLabel={stepLabel}
                  stepNumber={currentStep}
                  buildStatus={build.status}
                  buildPreviewUrl={build.previewUrl}
                  pipelineRunId={booking.tracker?.pipelineRun?.id ?? null}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* unclaimed bookings board */}
      <div className="mt-10">
        <h2 className="text-lg font-extrabold text-foreground">unclaimed</h2>
        <p className="mt-1 text-sm text-muted">
          {hasUnclaimed
            ? "claim a card to add it to your meetings"
            : "all bookings are claimed"}
        </p>

        <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
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
                {col.bookings.map((booking) => (
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
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
