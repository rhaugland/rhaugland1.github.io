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
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </button>

      {/* dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
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
          <div className="border-t border-gray-100 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-muted">add employee</p>
            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="name"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email (optional)"
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
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
