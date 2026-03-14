"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteCallButton({ callId }: { callId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/calls/${callId}`, { method: "DELETE" });
      router.refresh();
    } catch {
      setDeleting(false);
      setConfirming(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm font-semibold text-primary hover:underline disabled:opacity-50"
        >
          {deleting ? "deleting..." : "confirm"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-sm text-muted hover:underline"
        >
          cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm text-muted hover:text-primary hover:underline"
    >
      delete
    </button>
  );
}
