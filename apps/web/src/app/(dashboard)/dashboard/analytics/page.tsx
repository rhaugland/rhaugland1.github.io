import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AnalyticsDashboard } from "./analytics-dashboard";

const PLAN_PRICES: Record<string, number> = {
  SINGLE_SCOOP: 3500,
  DOUBLE_BLEND: 6000,
  TRIPLE_FREEZE: 8500,
};

const STEP_LABELS = [
  "meeting confirmed",
  "meeting",
  "slushie build review",
  "client build approval",
  "plug-in",
  "billing",
  "satisfaction survey",
];

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin?callbackUrl=/dashboard/analytics");

  // ── all bookings with trackers & assignees ──
  const bookings = await prisma.booking.findMany({
    include: {
      tracker: {
        select: {
          currentStep: true,
          steps: true,
          npsScore: true,
          npsCompletedAt: true,
          paidAt: true,
          createdAt: true,
        },
      },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // ── employees ──
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
  });

  // ── KPIs ──
  const totalBookings = bookings.length;
  const completedBookings = bookings.filter((b) => b.status === "COMPLETED");
  const cancelledBookings = bookings.filter((b) => b.status === "CANCELLED");
  const activeBookings = bookings.filter((b) => b.status === "CONFIRMED");

  const completionRate =
    totalBookings > 0
      ? Math.round((completedBookings.length / totalBookings) * 100)
      : 0;

  const cancellationRate =
    totalBookings > 0
      ? Math.round((cancelledBookings.length / totalBookings) * 100)
      : 0;

  // ── revenue ──
  const paidBookings = bookings.filter((b) => b.tracker?.paidAt);
  const totalRevenue = paidBookings.reduce(
    (sum, b) => sum + (PLAN_PRICES[b.plan] ?? 0),
    0
  );
  const freeAddons = paidBookings.filter(
    (b) => b.freeAddonEarned || (PLAN_PRICES[b.plan] === 3500 && b.tracker?.paidAt)
  );

  // revenue by plan
  const revenueByPlan: Record<string, { count: number; revenue: number }> = {};
  for (const b of paidBookings) {
    const plan = b.plan;
    if (!revenueByPlan[plan]) revenueByPlan[plan] = { count: 0, revenue: 0 };
    revenueByPlan[plan].count++;
    revenueByPlan[plan].revenue += PLAN_PRICES[plan] ?? 0;
  }

  // revenue over time (by month)
  const revenueByMonth: Record<string, number> = {};
  for (const b of paidBookings) {
    const month = b.tracker!.paidAt!.toISOString().slice(0, 7); // YYYY-MM
    revenueByMonth[month] = (revenueByMonth[month] ?? 0) + (PLAN_PRICES[b.plan] ?? 0);
  }

  // ── NPS ──
  const npsBookings = bookings.filter((b) => b.tracker?.npsScore != null);
  const avgNps =
    npsBookings.length > 0
      ? Math.round(
          (npsBookings.reduce((sum, b) => sum + b.tracker!.npsScore!, 0) /
            npsBookings.length) *
            10
        ) / 10
      : null;

  // NPS distribution
  const npsDistribution = Array.from({ length: 11 }, (_, i) => ({
    score: i,
    count: npsBookings.filter((b) => b.tracker!.npsScore === i).length,
  }));

  // NPS categories
  const promoters = npsBookings.filter((b) => b.tracker!.npsScore! >= 9).length;
  const passives = npsBookings.filter(
    (b) => b.tracker!.npsScore! >= 7 && b.tracker!.npsScore! <= 8
  ).length;
  const detractors = npsBookings.filter((b) => b.tracker!.npsScore! <= 6).length;
  const npsNetScore =
    npsBookings.length > 0
      ? Math.round(
          ((promoters - detractors) / npsBookings.length) * 100
        )
      : null;

  // ── pipeline velocity: avg time per step ──
  type StepData = {
    step: number;
    label: string;
    subtitle: string;
    status: string;
    completedAt: string | null;
  };

  const stepDurations: Record<number, number[]> = {};
  for (const b of bookings) {
    if (!b.tracker?.steps) continue;
    const steps = b.tracker.steps as StepData[];
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].completedAt) continue;
      const endTime = new Date(steps[i].completedAt!).getTime();
      const startTime =
        i === 0
          ? b.createdAt.getTime()
          : steps[i - 1].completedAt
          ? new Date(steps[i - 1].completedAt!).getTime()
          : null;
      if (startTime && endTime > startTime) {
        const hours = (endTime - startTime) / (1000 * 60 * 60);
        if (!stepDurations[i]) stepDurations[i] = [];
        stepDurations[i].push(hours);
      }
    }
  }

  const avgStepDurations = STEP_LABELS.map((label, i) => {
    const durations = stepDurations[i] ?? [];
    const avg =
      durations.length > 0
        ? Math.round(
            (durations.reduce((a, b) => a + b, 0) / durations.length) * 10
          ) / 10
        : null;
    return { step: i + 1, label, avgHours: avg, sampleSize: durations.length };
  });

  // ── pipeline funnel: how many bookings reached each step ──
  const funnelData = STEP_LABELS.map((label, i) => {
    const step = i + 1;
    const count = bookings.filter(
      (b) => b.tracker && b.tracker.currentStep >= step
    ).length;
    return { step, label, count };
  });

  // ── team workload ──
  const employeeStats = employees.map((emp) => {
    const empBookings = bookings.filter((b) => b.assigneeId === emp.id);
    const empCompleted = empBookings.filter((b) => b.status === "COMPLETED");
    const empActive = empBookings.filter((b) => b.status === "CONFIRMED");
    const empNps = empBookings.filter((b) => b.tracker?.npsScore != null);
    const empAvgNps =
      empNps.length > 0
        ? Math.round(
            (empNps.reduce((sum, b) => sum + b.tracker!.npsScore!, 0) /
              empNps.length) *
              10
          ) / 10
        : null;
    const empRevenue = empBookings
      .filter((b) => b.tracker?.paidAt)
      .reduce((sum, b) => sum + (PLAN_PRICES[b.plan] ?? 0), 0);

    return {
      id: emp.id,
      name: emp.name,
      active: empActive.length,
      completed: empCompleted.length,
      total: empBookings.length,
      avgNps: empAvgNps,
      revenue: empRevenue,
    };
  });

  // ── bookings by step (current pipeline state) ──
  const bookingsByStep = STEP_LABELS.map((label, i) => {
    const step = i + 1;
    return {
      step,
      label,
      count: activeBookings.filter(
        (b) => b.tracker && b.tracker.currentStep === step
      ).length,
    };
  });

  // ── plan popularity ──
  const planCounts: Record<string, number> = {};
  for (const b of bookings) {
    planCounts[b.plan] = (planCounts[b.plan] ?? 0) + 1;
  }

  // ── bookings over time (by week) ──
  const bookingsByWeek: Record<string, number> = {};
  for (const b of bookings) {
    const d = new Date(b.createdAt);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    bookingsByWeek[key] = (bookingsByWeek[key] ?? 0) + 1;
  }

  return (
    <AnalyticsDashboard
      kpis={{
        totalBookings,
        activeBookings: activeBookings.length,
        completedBookings: completedBookings.length,
        cancelledBookings: cancelledBookings.length,
        completionRate,
        cancellationRate,
        totalRevenue,
        avgNps,
        npsNetScore,
        surveyCount: npsBookings.length,
        promoters,
        passives,
        detractors,
      }}
      revenueByPlan={Object.entries(revenueByPlan).map(([plan, data]) => ({
        plan,
        ...data,
      }))}
      revenueByMonth={Object.entries(revenueByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, revenue]) => ({ month, revenue }))}
      npsDistribution={npsDistribution}
      avgStepDurations={avgStepDurations}
      funnelData={funnelData}
      employeeStats={employeeStats}
      bookingsByStep={bookingsByStep}
      planCounts={Object.entries(planCounts).map(([plan, count]) => ({
        plan,
        count,
      }))}
      bookingsByWeek={Object.entries(bookingsByWeek)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, count]) => ({ week, count }))}
    />
  );
}
