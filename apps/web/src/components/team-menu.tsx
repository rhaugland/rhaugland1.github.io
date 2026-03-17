"use client";

import { useEffect, useRef, useState } from "react";

interface Employee {
  id: string;
  name: string;
  email: string | null;
}

export function TeamMenu() {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const loadEmployees = () => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(data))
      .catch(() => {});
  };

  useEffect(() => {
    if (open) loadEmployees();
  }, [open]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || null }),
    });
    setNewName("");
    setNewEmail("");
    setAdding(false);
    loadEmployees();
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* person icon button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-full p-1 text-muted hover:text-white transition"
        title="manage team"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <circle cx="12" cy="8" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
      </button>

      {/* dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-surface shadow-lg">
          <div className="border-b border-border px-4 py-3">
            <h4 className="text-sm font-bold text-foreground">slushie team</h4>
          </div>

          {/* employee list */}
          <div className="max-h-48 overflow-y-auto px-4 py-2">
            {employees.length === 0 ? (
              <p className="text-xs text-muted">no employees yet</p>
            ) : (
              <div className="space-y-2">
                {employees.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {emp.name.split(" ").map((n) => n[0]).join("").toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{emp.name}</p>
                      {emp.email && <p className="text-xs text-muted">{emp.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* add new employee */}
          <div className="border-t border-border px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-muted">add employee</p>
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="name"
                className="w-full rounded border border-border bg-surface-light px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email (optional)"
                className="w-full rounded border border-border bg-surface-light px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newName.trim()}
                className="w-full rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {adding ? "adding..." : "add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
