"use client";

import { useEffect, useRef, useState } from "react";

interface Client {
  id: string;
  name: string;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  owner: string | null;
}

interface Employee {
  id: string;
  name: string;
  email: string | null;
}

interface StepClientProps {
  clientMode: "new" | "existing";
  setClientMode: (mode: "new" | "existing") => void;
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  clientName: string;
  setClientName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  contactName: string;
  setContactName: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  owner: string;
  setOwner: (v: string) => void;
  employees: Employee[];
  error: string | null;
}

const INDUSTRIES = [
  "plumbing", "cleaning", "consulting", "accounting", "legal",
  "real estate", "healthcare", "construction", "landscaping",
  "automotive", "restaurant", "retail", "other",
];

export default function WizardStepClient({
  clientMode, setClientMode, selectedClient, setSelectedClient,
  clientName, setClientName, industry, setIndustry,
  contactName, setContactName, contactEmail, setContactEmail,
  owner, setOwner, employees, error,
}: StepClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (clientMode !== "existing" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.clients);
        }
      } catch {
        // ignore search errors
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, clientMode]);

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">who is this call with?</h3>

      {/* mode selection */}
      <div className="mt-4 flex gap-3">
        <button
          onClick={() => { setClientMode("new"); setSelectedClient(null); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            clientMode === "new"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          new client
        </button>
        <button
          onClick={() => { setClientMode("existing"); }}
          className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition ${
            clientMode === "existing"
              ? "border-primary bg-primary/5 text-primary"
              : "border-gray-300 text-foreground hover:bg-gray-50"
          }`}
        >
          existing client
        </button>
      </div>

      {/* new client form */}
      {clientMode === "new" && (
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="clientName" className="mb-1 block text-sm font-medium text-foreground">
              client / business name *
            </label>
            <input
              id="clientName"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. mike's plumbing"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="industry" className="mb-1 block text-sm font-medium text-foreground">
              industry
            </label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">select an industry</option>
              {INDUSTRIES.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="contactName" className="mb-1 block text-sm font-medium text-foreground">
                contact name
              </label>
              <input
                id="contactName"
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. mike johnson"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label htmlFor="contactEmail" className="mb-1 block text-sm font-medium text-foreground">
                contact email
              </label>
              <input
                id="contactEmail"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="mike@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
          <div>
            <label htmlFor="owner" className="mb-1 block text-sm font-medium text-foreground">
              slushie owner
            </label>
            <select
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">select owner</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.name}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* existing client search */}
      {clientMode === "existing" && !selectedClient && (
        <div className="mt-4">
          <label htmlFor="clientSearch" className="mb-1 block text-sm font-medium text-foreground">
            search clients
          </label>
          <input
            id="clientSearch"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="type to search..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searching && <p className="mt-2 text-xs text-muted">searching...</p>}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setSearchQuery(""); setSearchResults([]); }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-foreground">{c.name}</span>
                  {c.industry && (
                    <span className="ml-2 text-muted">({c.industry})</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {searchQuery.trim() && !searching && searchResults.length === 0 && (
            <p className="mt-2 text-xs text-muted">no clients found</p>
          )}
        </div>
      )}

      {/* selected client display */}
      {clientMode === "existing" && selectedClient && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">{selectedClient.name}</p>
              <p className="text-sm text-muted">
                {selectedClient.industry}
                {selectedClient.contactName && ` · ${selectedClient.contactName}`}
              </p>
            </div>
            <button
              onClick={() => setSelectedClient(null)}
              className="text-sm text-muted underline hover:text-foreground"
            >
              change
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}
    </div>
  );
}
