"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BookingActionsProps {
  bookingId: string;
  trackingSlug: string | null;
  canAdvance: boolean;
}

export function BookingActions({
  bookingId,
  trackingSlug,
  canAdvance,
}: BookingActionsProps) {
  const router = useRouter();
  const [advancing, setAdvancing] = useState(false);

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await fetch(`/api/booking/${bookingId}/advance`, {
        method: "PATCH",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setAdvancing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {canAdvance && (
        <button
          onClick={handleAdvance}
          disabled={advancing}
          className="rounded bg-foreground px-2.5 py-1 text-xs font-medium text-white hover:bg-foreground/80 disabled:opacity-50"
        >
          {advancing ? "..." : "advance →"}
        </button>
      )}
    </div>
  );
}
