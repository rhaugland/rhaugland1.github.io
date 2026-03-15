import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingCard } from "./booking-card";

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

  const bookings = await prisma.booking.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { createdAt: "asc" },
    include: {
      tracker: { select: { slug: true, currentStep: true } },
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

  // group bookings by current step
  const columns = BOOKING_STEP_LABELS.map((label, i) => {
    const step = i + 1;
    return {
      step,
      label,
      bookings: bookings.filter((b) => (b.tracker?.currentStep ?? 0) === step),
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-foreground">dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        active bookings by step — claim a card to own it
      </p>

      <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
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
  );
}
