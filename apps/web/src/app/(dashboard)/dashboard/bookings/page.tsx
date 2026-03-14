import { prisma } from "@slushie/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BookingActions } from "./booking-actions";

export default async function BookingsPage() {
  const session = await auth();
  if (!session) redirect("/api/auth/signin");

  const bookings = await prisma.booking.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      tracker: {
        select: { slug: true, currentStep: true, steps: true },
      },
    },
  });

  const planLabels: Record<string, string> = {
    SINGLE_SCOOP: "single scoop",
    DOUBLE_BLEND: "double blend",
    TRIPLE_FREEZE: "triple freeze",
  };

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-foreground">bookings</h1>
      <p className="mt-1 text-sm text-muted">customer bookings from the landing page</p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted">
              <th className="pb-2 pr-4 font-medium">customer</th>
              <th className="pb-2 pr-4 font-medium">business</th>
              <th className="pb-2 pr-4 font-medium">plan</th>
              <th className="pb-2 pr-4 font-medium">meeting</th>
              <th className="pb-2 pr-4 font-medium">status</th>
              <th className="pb-2 pr-4 font-medium">step</th>
              <th className="pb-2 font-medium">actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => {
              const steps = booking.tracker?.steps as Array<{ step: number; label: string }> | null;
              const currentStep = booking.tracker?.currentStep ?? 0;
              const totalSteps = steps?.length ?? 0;
              const currentLabel = steps?.[currentStep - 1]?.label ?? "—";

              return (
                <tr key={booking.id} className="border-b border-gray-100">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-foreground">{booking.name}</div>
                    <div className="text-xs text-muted">{booking.email}</div>
                  </td>
                  <td className="py-3 pr-4 text-foreground">{booking.businessName}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                      {planLabels[booking.plan] ?? booking.plan}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    {booking.meetingTime.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        booking.status === "CONFIRMED"
                          ? "bg-green-100 text-green-700"
                          : booking.status === "COMPLETED"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {booking.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">
                    <span className="text-xs">
                      {currentStep}/{totalSteps} — {currentLabel}
                    </span>
                  </td>
                  <td className="py-3">
                    <BookingActions
                      bookingId={booking.id}
                      trackingSlug={booking.tracker?.slug ?? null}
                      canAdvance={currentStep < totalSteps}
                    />
                  </td>
                </tr>
              );
            })}
            {bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted">
                  no bookings yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
