"use client";

import { useState } from "react";

const PLAN_LABELS: Record<string, string> = {
  SINGLE_SCOOP: "single scoop",
  DOUBLE_BLEND: "double blend",
  TRIPLE_FREEZE: "triple freeze",
};

interface KPIs {
  totalBookings: number;
  activeBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  completionRate: number;
  cancellationRate: number;
  totalRevenue: number;
  avgNps: number | null;
  npsNetScore: number | null;
  surveyCount: number;
  promoters: number;
  passives: number;
  detractors: number;
}

interface AnalyticsDashboardProps {
  kpis: KPIs;
  revenueByPlan: Array<{ plan: string; count: number; revenue: number }>;
  revenueByMonth: Array<{ month: string; revenue: number }>;
  npsDistribution: Array<{ score: number; count: number }>;
  avgStepDurations: Array<{
    step: number;
    label: string;
    avgHours: number | null;
    sampleSize: number;
  }>;
  funnelData: Array<{ step: number; label: string; count: number }>;
  employeeStats: Array<{
    id: string;
    name: string;
    active: number;
    completed: number;
    total: number;
    avgNps: number | null;
    revenue: number;
  }>;
  bookingsByStep: Array<{ step: number; label: string; count: number }>;
  planCounts: Array<{ plan: string; count: number }>;
  bookingsByWeek: Array<{ week: string; count: number }>;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

function Bar({
  value,
  max,
  color = "from-primary to-secondary",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="h-5 w-full rounded-full bg-gray-100 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-500`}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

type Tab = "overview" | "revenue" | "pipeline" | "team" | "nps";

export function AnalyticsDashboard({
  kpis,
  revenueByPlan,
  revenueByMonth,
  npsDistribution,
  avgStepDurations,
  funnelData,
  employeeStats,
  bookingsByStep,
  planCounts,
  bookingsByWeek,
}: AnalyticsDashboardProps) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "overview" },
    { key: "revenue", label: "revenue" },
    { key: "pipeline", label: "pipeline" },
    { key: "team", label: "team" },
    { key: "nps", label: "NPS" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-foreground">analytics</h1>
        <p className="mt-1 text-sm text-muted">
          metrics across your bookings, revenue, pipeline, and team
        </p>
      </div>

      {/* tabs */}
      <div className="flex gap-1 mb-6 rounded-lg bg-gray-100 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-xs font-bold transition-all ${
              tab === t.key
                ? "bg-white text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="total bookings" value={kpis.totalBookings} />
            <KpiCard label="active" value={kpis.activeBookings} accent="text-blue-600" />
            <KpiCard label="completed" value={kpis.completedBookings} accent="text-primary" />
            <KpiCard
              label="completion rate"
              value={`${kpis.completionRate}%`}
              accent="text-primary"
            />
            <KpiCard
              label="total revenue"
              value={formatCurrency(kpis.totalRevenue)}
              accent="text-primary"
            />
            <KpiCard
              label="avg NPS"
              value={kpis.avgNps != null ? `${kpis.avgNps}` : "—"}
              accent="text-primary"
            />
            <KpiCard
              label="NPS net score"
              value={kpis.npsNetScore != null ? `${kpis.npsNetScore}` : "—"}
              subtitle={kpis.surveyCount > 0 ? `${kpis.surveyCount} surveys` : undefined}
            />
            <KpiCard
              label="cancelled"
              value={kpis.cancelledBookings}
              subtitle={`${kpis.cancellationRate}%`}
              accent="text-red-500"
            />
          </div>

          {/* bookings over time */}
          {bookingsByWeek.length > 0 && (
            <Section title="bookings over time" subtitle="weekly">
              <div className="flex items-end gap-1 h-32">
                {bookingsByWeek.map((w) => {
                  const max = Math.max(...bookingsByWeek.map((x) => x.count));
                  const pct = max > 0 ? (w.count / max) * 100 : 0;
                  return (
                    <div
                      key={w.week}
                      className="flex-1 group relative flex flex-col items-center justify-end"
                    >
                      <div
                        className="w-full rounded-t-md bg-gradient-to-t from-primary to-secondary transition-all duration-300 min-h-[4px]"
                        style={{ height: `${Math.max(pct, 3)}%` }}
                      />
                      <div className="absolute -top-6 hidden group-hover:block rounded bg-foreground px-2 py-1 text-[10px] text-white whitespace-nowrap">
                        {w.count} bookings &middot; w/o{" "}
                        {new Date(w.week).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* current pipeline state */}
          <Section title="current pipeline" subtitle="active bookings by step">
            <div className="space-y-2">
              {bookingsByStep.map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-bold text-muted">
                    {s.step}
                  </span>
                  <span className="w-36 text-xs text-foreground truncate">
                    {s.label}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={s.count}
                      max={Math.max(...bookingsByStep.map((x) => x.count), 1)}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-foreground">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ─── REVENUE ─── */}
      {tab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <KpiCard
              label="total revenue"
              value={formatCurrency(kpis.totalRevenue)}
              accent="text-primary"
            />
            <KpiCard
              label="paid bookings"
              value={revenueByPlan.reduce((s, p) => s + p.count, 0)}
            />
            <KpiCard
              label="avg deal size"
              value={
                revenueByPlan.reduce((s, p) => s + p.count, 0) > 0
                  ? formatCurrency(
                      kpis.totalRevenue /
                        revenueByPlan.reduce((s, p) => s + p.count, 0)
                    )
                  : "—"
              }
            />
          </div>

          {/* revenue by plan */}
          <Section title="revenue by plan">
            <div className="space-y-3">
              {revenueByPlan.map((p) => (
                <div key={p.plan} className="flex items-center gap-3">
                  <span className="w-28 text-xs font-medium text-foreground">
                    {PLAN_LABELS[p.plan] ?? p.plan}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={p.revenue}
                      max={Math.max(...revenueByPlan.map((x) => x.revenue), 1)}
                    />
                  </div>
                  <span className="w-20 text-right text-xs font-bold text-foreground">
                    {formatCurrency(p.revenue)}
                  </span>
                  <span className="w-12 text-right text-[10px] text-muted">
                    {p.count} sold
                  </span>
                </div>
              ))}
              {revenueByPlan.length === 0 && (
                <p className="text-xs text-muted text-center py-4">no revenue yet</p>
              )}
            </div>
          </Section>

          {/* revenue over time */}
          {revenueByMonth.length > 0 && (
            <Section title="revenue over time" subtitle="monthly">
              <div className="space-y-2">
                {revenueByMonth.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-muted">
                      {new Date(m.month + "-01").toLocaleDateString("en-US", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <div className="flex-1">
                      <Bar
                        value={m.revenue}
                        max={Math.max(...revenueByMonth.map((x) => x.revenue), 1)}
                      />
                    </div>
                    <span className="w-20 text-right text-xs font-bold text-foreground">
                      {formatCurrency(m.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* plan popularity */}
          <Section title="plan popularity" subtitle="all bookings">
            <div className="space-y-2">
              {planCounts.map((p) => (
                <div key={p.plan} className="flex items-center gap-3">
                  <span className="w-28 text-xs font-medium text-foreground">
                    {PLAN_LABELS[p.plan] ?? p.plan}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={p.count}
                      max={Math.max(...planCounts.map((x) => x.count), 1)}
                      color="from-secondary to-primary"
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-foreground">
                    {p.count}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ─── PIPELINE ─── */}
      {tab === "pipeline" && (
        <div className="space-y-6">
          {/* funnel */}
          <Section title="pipeline funnel" subtitle="bookings that reached each step">
            <div className="space-y-2">
              {funnelData.map((f) => {
                const maxCount = funnelData[0]?.count ?? 1;
                const dropoff =
                  f.step > 1
                    ? funnelData[f.step - 2].count - f.count
                    : 0;
                return (
                  <div key={f.step} className="flex items-center gap-3">
                    <span className="w-5 text-right text-xs font-bold text-muted">
                      {f.step}
                    </span>
                    <span className="w-36 text-xs text-foreground truncate">
                      {f.label}
                    </span>
                    <div className="flex-1">
                      <Bar value={f.count} max={maxCount} />
                    </div>
                    <span className="w-8 text-right text-xs font-bold text-foreground">
                      {f.count}
                    </span>
                    {dropoff > 0 && (
                      <span className="w-16 text-right text-[10px] text-red-400">
                        -{dropoff} drop
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* step velocity */}
          <Section
            title="pipeline velocity"
            subtitle="avg time spent at each step"
          >
            <div className="space-y-2">
              {avgStepDurations.map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-bold text-muted">
                    {s.step}
                  </span>
                  <span className="w-36 text-xs text-foreground truncate">
                    {s.label}
                  </span>
                  <div className="flex-1">
                    {s.avgHours != null ? (
                      <Bar
                        value={s.avgHours}
                        max={Math.max(
                          ...avgStepDurations
                            .filter((x) => x.avgHours != null)
                            .map((x) => x.avgHours!),
                          1
                        )}
                        color="from-amber-400 to-orange-500"
                      />
                    ) : (
                      <div className="h-5 w-full rounded-full bg-gray-50" />
                    )}
                  </div>
                  <span className="w-12 text-right text-xs font-bold text-foreground">
                    {s.avgHours != null ? formatHours(s.avgHours) : "—"}
                  </span>
                  <span className="w-10 text-right text-[10px] text-muted">
                    n={s.sampleSize}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* current state */}
          <Section title="current pipeline" subtitle="active bookings by step">
            <div className="space-y-2">
              {bookingsByStep.map((s) => (
                <div key={s.step} className="flex items-center gap-3">
                  <span className="w-5 text-right text-xs font-bold text-muted">
                    {s.step}
                  </span>
                  <span className="w-36 text-xs text-foreground truncate">
                    {s.label}
                  </span>
                  <div className="flex-1">
                    <Bar
                      value={s.count}
                      max={Math.max(...bookingsByStep.map((x) => x.count), 1)}
                    />
                  </div>
                  <span className="w-8 text-right text-xs font-bold text-foreground">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      {/* ─── TEAM ─── */}
      {tab === "team" && (
        <div className="space-y-6">
          <Section title="team performance">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-bold text-muted">
                      employee
                    </th>
                    <th className="text-right py-2 px-3 font-bold text-muted">
                      active
                    </th>
                    <th className="text-right py-2 px-3 font-bold text-muted">
                      completed
                    </th>
                    <th className="text-right py-2 px-3 font-bold text-muted">
                      total
                    </th>
                    <th className="text-right py-2 px-3 font-bold text-muted">
                      avg NPS
                    </th>
                    <th className="text-right py-2 pl-3 font-bold text-muted">
                      revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employeeStats.map((emp) => (
                    <tr
                      key={emp.id}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-secondary/20 flex items-center justify-center text-[10px] font-bold text-secondary">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">
                            {emp.name}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-3 text-foreground">
                        {emp.active}
                      </td>
                      <td className="text-right py-3 px-3 text-foreground">
                        {emp.completed}
                      </td>
                      <td className="text-right py-3 px-3 font-bold text-foreground">
                        {emp.total}
                      </td>
                      <td className="text-right py-3 px-3">
                        {emp.avgNps != null ? (
                          <span
                            className={`rounded-full px-2 py-0.5 font-bold ${
                              emp.avgNps >= 9
                                ? "bg-primary/10 text-primary"
                                : emp.avgNps >= 7
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-600"
                            }`}
                          >
                            {emp.avgNps}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-right py-3 pl-3 font-bold text-foreground">
                        {emp.revenue > 0 ? formatCurrency(emp.revenue) : "—"}
                      </td>
                    </tr>
                  ))}
                  {employeeStats.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center py-8 text-muted"
                      >
                        no employees yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* workload distribution bar chart */}
          {employeeStats.length > 0 && (
            <Section title="workload distribution" subtitle="active bookings">
              <div className="space-y-2">
                {employeeStats
                  .filter((e) => e.active > 0)
                  .sort((a, b) => b.active - a.active)
                  .map((emp) => (
                    <div key={emp.id} className="flex items-center gap-3">
                      <span className="w-24 text-xs font-medium text-foreground truncate">
                        {emp.name}
                      </span>
                      <div className="flex-1">
                        <Bar
                          value={emp.active}
                          max={Math.max(
                            ...employeeStats.map((e) => e.active),
                            1
                          )}
                        />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-foreground">
                        {emp.active}
                      </span>
                    </div>
                  ))}
                {employeeStats.every((e) => e.active === 0) && (
                  <p className="text-xs text-muted text-center py-4">
                    no active assignments
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* revenue leaderboard */}
          {employeeStats.some((e) => e.revenue > 0) && (
            <Section title="revenue leaderboard">
              <div className="space-y-2">
                {employeeStats
                  .filter((e) => e.revenue > 0)
                  .sort((a, b) => b.revenue - a.revenue)
                  .map((emp, i) => (
                    <div key={emp.id} className="flex items-center gap-3">
                      <span className="w-5 text-right text-xs font-bold text-muted">
                        {i + 1}
                      </span>
                      <span className="w-24 text-xs font-medium text-foreground truncate">
                        {emp.name}
                      </span>
                      <div className="flex-1">
                        <Bar
                          value={emp.revenue}
                          max={Math.max(
                            ...employeeStats.map((e) => e.revenue),
                            1
                          )}
                          color="from-green-400 to-emerald-500"
                        />
                      </div>
                      <span className="w-20 text-right text-xs font-bold text-foreground">
                        {formatCurrency(emp.revenue)}
                      </span>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ─── NPS ─── */}
      {tab === "nps" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="avg NPS"
              value={kpis.avgNps != null ? `${kpis.avgNps}` : "—"}
              accent="text-primary"
            />
            <KpiCard
              label="net NPS score"
              value={kpis.npsNetScore != null ? `${kpis.npsNetScore}` : "—"}
              subtitle={
                kpis.npsNetScore != null
                  ? kpis.npsNetScore >= 50
                    ? "excellent"
                    : kpis.npsNetScore >= 0
                    ? "good"
                    : "needs work"
                  : undefined
              }
              accent={
                kpis.npsNetScore != null && kpis.npsNetScore >= 50
                  ? "text-primary"
                  : kpis.npsNetScore != null && kpis.npsNetScore >= 0
                  ? "text-amber-600"
                  : "text-red-500"
              }
            />
            <KpiCard label="surveys" value={kpis.surveyCount} />
            <KpiCard
              label="response rate"
              value={
                kpis.completedBookings > 0
                  ? `${Math.round(
                      (kpis.surveyCount / kpis.completedBookings) * 100
                    )}%`
                  : "—"
              }
            />
          </div>

          {/* NPS breakdown */}
          <Section title="NPS breakdown">
            <div className="flex gap-4">
              <div className="flex-1 rounded-lg bg-primary/5 border border-primary/15 p-3 text-center">
                <p className="text-2xl font-extrabold text-primary">
                  {kpis.promoters}
                </p>
                <p className="text-[10px] font-bold text-primary mt-1">
                  promoters (9-10)
                </p>
              </div>
              <div className="flex-1 rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
                <p className="text-2xl font-extrabold text-amber-600">
                  {kpis.passives}
                </p>
                <p className="text-[10px] font-bold text-amber-600 mt-1">
                  passives (7-8)
                </p>
              </div>
              <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <p className="text-2xl font-extrabold text-red-500">
                  {kpis.detractors}
                </p>
                <p className="text-[10px] font-bold text-red-500 mt-1">
                  detractors (0-6)
                </p>
              </div>
            </div>
          </Section>

          {/* score distribution */}
          <Section title="score distribution">
            <div className="flex items-end gap-1 h-32">
              {npsDistribution.map((d) => {
                const max = Math.max(
                  ...npsDistribution.map((x) => x.count),
                  1
                );
                const pct = (d.count / max) * 100;
                const color =
                  d.score >= 9
                    ? "from-primary to-secondary"
                    : d.score >= 7
                    ? "from-amber-400 to-amber-500"
                    : "from-red-400 to-red-500";
                return (
                  <div
                    key={d.score}
                    className="flex-1 flex flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[10px] font-bold text-foreground">
                      {d.count > 0 ? d.count : ""}
                    </span>
                    <div
                      className={`w-full rounded-t-md bg-gradient-to-t ${color} transition-all duration-300 min-h-[4px]`}
                      style={{ height: `${Math.max(pct, 3)}%` }}
                    />
                    <span className="text-[10px] text-muted">{d.score}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* NPS by employee */}
          {employeeStats.some((e) => e.avgNps != null) && (
            <Section title="NPS by employee">
              <div className="space-y-2">
                {employeeStats
                  .filter((e) => e.avgNps != null)
                  .sort((a, b) => (b.avgNps ?? 0) - (a.avgNps ?? 0))
                  .map((emp) => (
                    <div key={emp.id} className="flex items-center gap-3">
                      <div className="flex items-center gap-2 w-28">
                        <div className="h-5 w-5 rounded-full bg-secondary/20 flex items-center justify-center text-[9px] font-bold text-secondary">
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-foreground truncate">
                          {emp.name}
                        </span>
                      </div>
                      <div className="flex-1">
                        <Bar
                          value={emp.avgNps ?? 0}
                          max={10}
                          color={
                            (emp.avgNps ?? 0) >= 9
                              ? "from-primary to-secondary"
                              : (emp.avgNps ?? 0) >= 7
                              ? "from-amber-400 to-amber-500"
                              : "from-red-400 to-red-500"
                          }
                        />
                      </div>
                      <span
                        className={`w-10 text-right text-xs font-bold ${
                          (emp.avgNps ?? 0) >= 9
                            ? "text-primary"
                            : (emp.avgNps ?? 0) >= 7
                            ? "text-amber-600"
                            : "text-red-500"
                        }`}
                      >
                        {emp.avgNps}
                      </span>
                    </div>
                  ))}
              </div>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-4">
      <p className="text-[10px] font-bold text-muted uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-extrabold mt-1 ${accent ?? "text-foreground"}`}>
        {value}
      </p>
      {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-extrabold text-foreground">{title}</h2>
        {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
