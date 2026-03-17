import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingCard } from "./booking-card";
import { ReviewAlert } from "./review-alert";

const BOOKING_STEP_LABELS = [
  "intake build",
  "schedule discovery",
  "discovery meeting",
  "discovery build",
  "client build approval",
  "plug-in",
  "billing",
  "satisfaction survey",
  "postmortem",
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin?callbackUrl=/dashboard");

  const userEmail = session.user?.email ?? "";

  // find or create the employee record matching the logged-in user
  let currentEmployee = await prisma.employee.findFirst({
    where: {
      email: { equals: userEmail, mode: "insensitive" },
    },
  });

  if (!currentEmployee && userEmail) {
    currentEmployee = await prisma.employee.create({
      data: {
        name: session.user?.name ?? userEmail.split("@")[0],
        email: userEmail,
      },
    });
  }

  const PLAN_WORKFLOW_COUNT: Record<string, number> = {
    SINGLE_SCOOP: 1,
    DOUBLE_BLEND: 2,
    TRIPLE_FREEZE: 3,
  };

  const bookings = await prisma.booking.findMany({
    where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
    orderBy: { createdAt: "asc" },
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
          npsCompletedAt: true,
          discoveryEmailStatus: true,
          discoveryEmailSentAt: true,
          pipelineRun: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              gapMeetingStartedAt: true,
              gapMeetingCompletedAt: true,
              postmortem: {
                select: {
                  id: true,
                  employeeFeedback: true,
                },
              },
              call: {
                select: {
                  analysis: {
                    select: {
                      buildSpecs: {
                        orderBy: { version: "asc" },
                        select: {
                          version: true,
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

  // compute average NPS per employee from their completed bookings
  const npsData = await prisma.booking.findMany({
    where: {
      assigneeId: { not: null },
      tracker: { npsScore: { not: null } },
    },
    select: {
      assigneeId: true,
      tracker: { select: { npsScore: true } },
    },
  });
  const employeeAvgNps: Record<string, number> = {};
  const npsBuckets: Record<string, number[]> = {};
  for (const row of npsData) {
    if (!row.assigneeId || row.tracker?.npsScore == null) continue;
    if (!npsBuckets[row.assigneeId]) npsBuckets[row.assigneeId] = [];
    npsBuckets[row.assigneeId].push(row.tracker.npsScore);
  }
  for (const [empId, scores] of Object.entries(npsBuckets)) {
    employeeAvgNps[empId] = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  }

  const planLabels: Record<string, string> = {
    SINGLE_SCOOP: "single scoop",
    DOUBLE_BLEND: "double blend",
    TRIPLE_FREEZE: "triple freeze",
  };

  // auto-advance is handled by the claim route — no need for meeting-day check

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
    v1PreviewUrl?: string;
    v2Status?: "awaiting-meeting" | "in-meeting" | "analyzing" | "gap-report" | "building" | "ready" | null;
    v2PreviewUrl?: string;
    latestVersion?: number;
  } {
    const run = booking.tracker?.pipelineRun;
    if (!run) return { status: "none" };

    const specs = run.call?.analysis?.buildSpecs ?? [];
    const allProtos = specs.flatMap((s) => s.prototypes);
    const v1Proto = allProtos.find((p) => p.version === 1);
    const latestProto = allProtos.length > 0 ? allProtos[allProtos.length - 1] : null;
    const latestVersion = latestProto?.version ?? 0;

    const previewUrl = latestProto ? `/dashboard/preview/${run.id}` : undefined;
    const v1PreviewUrl = v1Proto ? `/dashboard/preview/${run.id}` : undefined;

    // if pipeline completed, everything is ready
    if (run.status === "COMPLETED") {
      return { status: "ready", previewUrl, v1PreviewUrl, v2Status: latestVersion >= 2 ? "ready" : null, v2PreviewUrl: previewUrl, latestVersion };
    }

    // v1 exists — figure out v2 progress
    if (v1Proto) {
      let v2Status: "awaiting-meeting" | "in-meeting" | "analyzing" | "gap-report" | "building" | "ready" | null = null;

      if (latestVersion >= 2) {
        v2Status = "ready";
      } else if (specs.length >= 2) {
        v2Status = "building";
      } else if (!run.gapMeetingStartedAt) {
        // v1 is ready but no gap meeting started yet
        v2Status = "awaiting-meeting";
      } else if (run.gapMeetingStartedAt && !run.gapMeetingCompletedAt) {
        // gap meeting in progress
        v2Status = "in-meeting";
      } else if (run.gapMeetingCompletedAt && specs.length === 1) {
        // meeting done, reviewer/analyst working
        v2Status = "gap-report";
      }

      return { status: "ready", previewUrl, v1PreviewUrl, v2Status, v2PreviewUrl: previewUrl, latestVersion };
    }

    // no prototype yet
    const hasBuildSpec = specs.length > 0;
    if (hasBuildSpec) return { status: "building" };

    return { status: "analyzing" };
  }

  // group visible bookings by step — COMPLETED bookings go to step 9 (postmortem)
  const columns = BOOKING_STEP_LABELS.map((label, i) => {
    const step = i + 1;
    return {
      step,
      label,
      bookings: visibleBookings.filter((b) => {
        if (step === 9) return b.status === "COMPLETED";
        return b.status !== "COMPLETED" && (b.tracker?.currentStep ?? 0) === step;
      }),
    };
  });

  // find all follow-up bookings to determine next workflow status
  const completedBookingIds = visibleBookings
    .filter((b) => b.status === "COMPLETED")
    .map((b) => b.id);

  const followUpBookings = completedBookingIds.length > 0
    ? await prisma.booking.findMany({
        where: { parentBookingId: { in: completedBookingIds } },
        select: { parentBookingId: true },
      })
    : [];

  const scheduledFollowUps = new Set(followUpBookings.map((f) => f.parentBookingId));

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
                meetingTime={booking.meetingTime?.toISOString() ?? null}
              />
            ))}
          </div>
        </div>
      )}

      {/* unified kanban board */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">slushie machine</h1>
            <p className="mt-1 text-sm text-muted">
              {totalVisible > 0
                ? "your bookings and unclaimed work, organized by step"
                : "no bookings yet"}
            </p>
          </div>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <div
              key={col.step}
              className="flex-shrink-0 w-72 rounded-xl bg-surface border border-border"
            >
              {/* column header */}
              <div className="sticky top-0 px-3 py-3 border-b border-border bg-surface rounded-t-xl">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-foreground">
                    {col.step}. {col.label}
                  </p>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-muted">
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
                      meetingTime={booking.meetingTime?.toISOString() ?? null}
                      trackingSlug={booking.tracker?.slug ?? null}
                      assignee={booking.assignee}
                      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
                      employeeAvgNps={employeeAvgNps}
                      buildStatus={build.status}
                      buildPreviewUrl={build.previewUrl}
                      v1PreviewUrl={build.v1PreviewUrl}
                      v2Status={build.v2Status ?? null}
                      v2PreviewUrl={build.v2PreviewUrl}
                      latestVersion={build.latestVersion ?? 0}
                      pipelineStartedAt={booking.tracker?.pipelineRun?.startedAt?.toISOString() ?? null}
                      pipelineRunId={booking.tracker?.pipelineRun?.id ?? null}
                      currentStep={booking.tracker?.currentStep ?? 0}
                      clientFeedback={booking.tracker?.clientFeedback ?? null}
                      revisionStatus={booking.tracker?.revisionStatus ?? null}
                      pluginCredentials={(booking.tracker?.pluginCredentials as Array<{ service: string; value: string }>) ?? null}
                      pluginStatus={booking.tracker?.pluginStatus ?? null}
                      isPaid={!!booking.tracker?.paidAt}
                      npsScore={booking.tracker?.npsScore ?? null}
                      freeAddonEarned={booking.freeAddonEarned}
                      postmortemStatus={
                        booking.status === "COMPLETED"
                          ? booking.tracker?.pipelineRun?.postmortem?.employeeFeedback
                            ? "reviewed"
                            : "pending"
                          : null
                      }
                      postmortemPipelineRunId={booking.tracker?.pipelineRun?.id ?? null}
                      nextWorkflowStatus={
                        booking.status === "COMPLETED" &&
                        (PLAN_WORKFLOW_COUNT[booking.plan] ?? 1) > booking.workflowNumber
                          ? scheduledFollowUps.has(booking.id)
                            ? "scheduled"
                            : "eligible"
                          : null
                      }
                      workflowLabel={
                        (PLAN_WORKFLOW_COUNT[booking.plan] ?? 1) > 1
                          ? `${booking.workflowNumber} of ${PLAN_WORKFLOW_COUNT[booking.plan]}`
                          : null
                      }
                      discoveryEmailStatus={booking.tracker?.discoveryEmailStatus ?? null}
                      discoveryEmailSentAt={booking.tracker?.discoveryEmailSentAt?.toISOString() ?? null}
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
