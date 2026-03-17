"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface ClientData {
  id: string;
  name: string;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  owner: string | null;
  stage: "WORKING" | "DONE";
  doneAt: string | null;
  callCount: number;
  lastContactDate: string | null;
  createdAt: string;
}

interface ClientsViewProps {
  clients: ClientData[];
  industries: string[];
  owners: string[];
}

type Tab = "actions" | "addressbook";
type SortField = "name-az" | "name-za" | "last-contact-oldest" | "last-contact-newest";

function formatTimeRemaining(doneAtIso: string): string {
  const doneAt = new Date(doneAtIso).getTime();
  const expiresAt = doneAt + 24 * 60 * 60 * 1000;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return "soon";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function ClientsView({ clients, industries, owners }: ClientsViewProps) {
  const [tab, setTab] = useState<Tab>("actions");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">clients</h2>
        <p className="text-sm text-muted">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
      </div>

      {/* tabs */}
      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-surface-light p-1">
        <button
          onClick={() => setTab("actions")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "actions" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          client actions
        </button>
        <button
          onClick={() => setTab("addressbook")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            tab === "addressbook" ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          address book
        </button>
      </div>

      {tab === "actions" ? (
        <ActionsTab clients={clients} industries={industries} owners={owners} />
      ) : (
        <AddressBookTab clients={clients} />
      )}
    </div>
  );
}

// ─── Actions Tab (existing cards view) ───

function ActionsTab({
  clients,
  industries,
  owners,
}: {
  clients: ClientData[];
  industries: string[];
  owners: string[];
}) {
  const router = useRouter();
  const [industryFilter, setIndustryFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOwner, setEditOwner] = useState("");
  const [editStage, setEditStage] = useState<"WORKING" | "DONE">("WORKING");

  const filtered = clients.filter((c) => {
    if (industryFilter && c.industry !== industryFilter) return false;
    if (ownerFilter && c.owner !== ownerFilter) return false;
    if (stageFilter && c.stage !== stageFilter) return false;
    return true;
  });

  const handleSave = async (clientId: string) => {
    await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner: editOwner || null, stage: editStage }),
    });
    setEditingId(null);
    router.refresh();
  };

  const startEdit = (c: ClientData) => {
    setEditingId(c.id);
    setEditOwner(c.owner ?? "");
    setEditStage(c.stage);
  };

  return (
    <>
      {/* filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">all industries</option>
          {industries.map((ind) => (
            <option key={ind} value={ind}>{ind}</option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">all owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="">all stages</option>
          <option value="WORKING">working</option>
          <option value="DONE">done</option>
        </select>

        {(industryFilter || ownerFilter || stageFilter) && (
          <button
            onClick={() => { setIndustryFilter(""); setOwnerFilter(""); setStageFilter(""); }}
            className="text-sm text-primary hover:underline"
          >
            clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {clients.length === 0
            ? "no clients yet. start a call to create one."
            : "no clients match your filters."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => {
            const isEditing = editingId === client.id;

            return (
              <div
                key={client.id}
                className="rounded-lg border border-border bg-surface p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <h3 className="text-lg font-bold text-foreground">{client.name}</h3>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        client.stage === "DONE"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {client.stage === "DONE" ? "done" : "working"}
                    </span>
                    {client.stage === "DONE" && client.doneAt && (
                      <p className="mt-1 text-[10px] text-muted">
                        removes in {formatTimeRemaining(client.doneAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">industry</span>
                    <span className="font-medium text-foreground">{client.industry}</span>
                  </div>
                  {client.contactName && (
                    <div className="flex justify-between">
                      <span className="text-muted">contact</span>
                      <span className="font-medium text-foreground">{client.contactName}</span>
                    </div>
                  )}
                  {client.contactEmail && (
                    <div className="flex justify-between">
                      <span className="text-muted">email</span>
                      <span className="font-medium text-foreground">{client.contactEmail}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted">owner</span>
                    {isEditing ? (
                      <input
                        value={editOwner}
                        onChange={(e) => setEditOwner(e.target.value)}
                        placeholder="assign owner"
                        className="w-32 rounded border border-border px-2 py-0.5 text-right text-sm focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <span className="font-medium text-foreground">
                        {client.owner || <span className="text-muted italic">unassigned</span>}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">calls</span>
                    <span className="font-medium text-foreground">{client.callCount}</span>
                  </div>
                </div>

                <div className="mt-3 border-t border-border pt-3">
                  {isEditing ? (
                    <div className="flex items-center justify-between">
                      <select
                        value={editStage}
                        onChange={(e) => setEditStage(e.target.value as "WORKING" | "DONE")}
                        className="rounded border border-border px-2 py-1 text-xs focus:border-primary focus:outline-none"
                      >
                        <option value="WORKING">working</option>
                        <option value="DONE">done</option>
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(client.id)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-muted hover:underline"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(client)}
                      className="text-xs text-muted hover:text-primary hover:underline"
                    >
                      edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── Address Book Tab ───

function AddressBookTab({ clients }: { clients: ClientData[] }) {
  const [sort, setSort] = useState<SortField>("name-az");

  const sorted = useMemo(() => {
    const list = [...clients];
    switch (sort) {
      case "name-az":
        return list.sort((a, b) => (a.contactName ?? a.name).localeCompare(b.contactName ?? b.name));
      case "name-za":
        return list.sort((a, b) => (b.contactName ?? b.name).localeCompare(a.contactName ?? a.name));
      case "last-contact-oldest":
        return list.sort((a, b) => {
          const da = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
          const db = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
          return da - db;
        });
      case "last-contact-newest":
        return list.sort((a, b) => {
          const da = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
          const db = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
          return db - da;
        });
      default:
        return list;
    }
  }, [clients, sort]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "never";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <>
      {/* sort controls */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-muted">sort by</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortField)}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="name-az">name A → Z</option>
          <option value="name-za">name Z → A</option>
          <option value="last-contact-oldest">longest since contact</option>
          <option value="last-contact-newest">most recent contact</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted">no clients yet. start a call to create one.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-light">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">contact name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">industry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted">last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {sorted.map((client) => (
                <tr key={client.id} className="hover:bg-surface-light transition">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {client.contactName || <span className="text-muted italic">--</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">{client.name}</td>
                  <td className="px-4 py-3 text-sm text-muted">{client.industry}</td>
                  <td className="px-4 py-3 text-sm">
                    {client.contactEmail ? (
                      <a href={`mailto:${client.contactEmail}`} className="text-primary hover:underline">
                        {client.contactEmail}
                      </a>
                    ) : (
                      <span className="text-muted italic">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {formatDate(client.lastContactDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
