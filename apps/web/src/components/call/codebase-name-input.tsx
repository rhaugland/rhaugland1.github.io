"use client";

import { useState } from "react";

interface CodebaseNameInputProps {
  codebaseId: string;
}

export default function CodebaseNameInput({ codebaseId }: CodebaseNameInputProps) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/codebases/${codebaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) setSaved(true);
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return <span className="text-xs text-muted">{name}</span>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="name this codebase"
        className="w-36 rounded border border-gray-300 px-2 py-0.5 text-xs"
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        className="rounded bg-primary px-2 py-0.5 text-xs text-white disabled:opacity-50"
      >
        {saving ? "..." : "save"}
      </button>
    </div>
  );
}
