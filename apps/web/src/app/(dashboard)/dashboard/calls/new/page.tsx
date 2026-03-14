"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WizardStepClient from "@/components/call/wizard-step-client";
import WizardStepCodebase from "@/components/call/wizard-step-codebase";
import WizardStepReview from "@/components/call/wizard-step-review";

interface Employee {
  id: string;
  name: string;
  email: string | null;
}

interface Client {
  id: string;
  name: string;
  industry: string;
  contactName: string | null;
  contactEmail: string | null;
  owner: string | null;
}

type DemoMode = "idle" | "loading" | "review";

const STEPS = ["client", "codebase", "review"] as const;

export default function NewCallPage() {
  const router = useRouter();

  // wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1: client
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [owner, setOwner] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  // step 2: codebase
  const [codebaseMode, setCodebaseMode] = useState<"new" | "upload" | "previous">("new");
  const [uploadedCodebaseId, setUploadedCodebaseId] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [selectedCodebaseId, setSelectedCodebaseId] = useState<string | null>(null);
  const [selectedCodebaseName, setSelectedCodebaseName] = useState<string | null>(null);

  // general
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // demo call
  const [demoMode, setDemoMode] = useState<DemoMode>("idle");
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(data))
      .catch(() => {});
  }, []);

  const getClientId = (): string | null => {
    if (clientMode === "existing") return selectedClient?.id ?? null;
    return createdClientId;
  };

  const getCodebaseId = (): string | null => {
    if (codebaseMode === "upload") return uploadedCodebaseId;
    if (codebaseMode === "previous") return selectedCodebaseId;
    return null;
  };

  // step 1 → 2: validate and eagerly create client if new
  const advanceToStep2 = async () => {
    setError(null);

    if (clientMode === "new") {
      if (!clientName.trim()) {
        setError("client name is required");
        return;
      }

      setIsLoading(true);
      try {
        const payload = {
          name: clientName.trim(),
          industry: industry || "other",
          contactName: contactName.trim() || undefined,
          contactEmail: contactEmail.trim() || undefined,
          owner: owner || undefined,
        };

        if (createdClientId) {
          // update existing eagerly-created client
          const res = await fetch(`/api/clients/${createdClientId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error ?? "failed to update client");
          }
        } else {
          // create new client
          const res = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error ?? "failed to create client");
          }
          const data = await res.json();
          setCreatedClientId(data.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "something went wrong");
        setIsLoading(false);
        return;
      }
      setIsLoading(false);
    } else {
      if (!selectedClient) {
        setError("please select a client");
        return;
      }
    }

    setStep(2);
  };

  // step 2 → 3: validate codebase selection
  const advanceToStep3 = () => {
    setError(null);

    if (codebaseMode === "upload" && !uploadedCodebaseId) {
      setError("please upload a file first");
      return;
    }

    if (codebaseMode === "previous" && !selectedCodebaseId) {
      setError("please select a codebase");
      return;
    }

    setStep(3);
  };

  const handleStartCall = async () => {
    const clientId = getClientId();
    if (!clientId) {
      setError("client not found — go back and select a client");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const codebaseId = getCodebaseId();

      const res = await fetch("/api/calls/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          codebaseId: codebaseId || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to start call");
      }

      const data = await res.json();
      router.push(`/dashboard/calls/live/${data.pipelineRunId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setIsLoading(false);
    }
  };

  const handleDemoCall = async () => {
    setError(null);
    setDemoMode("loading");

    const name = clientMode === "existing" ? selectedClient?.name : clientName.trim();

    try {
      const res = await fetch("/api/calls/demo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: name,
          industry: clientMode === "existing" ? selectedClient?.industry : (industry || "other"),
          contactName: clientMode === "existing" ? selectedClient?.contactName : (contactName.trim() || undefined),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to generate transcript");
      }

      const data = await res.json();
      setTranscript(data.transcript);
      setDemoMode("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setDemoMode("idle");
    }
  };

  const handleDemoExecute = async () => {
    setError(null);
    setDemoMode("loading");

    try {
      const clientId = getClientId();
      const codebaseId = getCodebaseId();

      const body: Record<string, unknown> = {
        transcript,
        codebaseId: codebaseId || undefined,
      };

      if (clientId) {
        body.clientId = clientId;
      } else {
        body.clientName = clientName.trim();
        body.industry = industry || "other";
        body.contactName = contactName.trim() || undefined;
        body.contactEmail = contactEmail.trim() || undefined;
        body.owner = owner || undefined;
      }

      const res = await fetch("/api/calls/demo/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "failed to execute demo call");
      }

      router.push("/dashboard/calls");
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
      setDemoMode("review");
    }
  };

  // demo loading state
  if (demoMode === "loading") {
    return (
      <div className="mx-auto max-w-lg pt-8">
        <h2 className="text-2xl font-bold text-foreground">demo call</h2>
        <div className="mt-8 flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted">
            {transcript ? "executing demo call..." : "generating transcript..."}
          </p>
        </div>
      </div>
    );
  }

  // demo review state
  if (demoMode === "review") {
    return (
      <div className="mx-auto max-w-2xl pt-8">
        <h2 className="text-2xl font-bold text-foreground">review transcript</h2>
        <p className="mt-1 text-sm text-muted">
          review the generated transcript. rework to generate a new one, or execute to run the pipeline.
        </p>
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-gray-300 bg-white p-4">
          <pre className="whitespace-pre-wrap text-sm text-foreground font-mono leading-relaxed">{transcript}</pre>
        </div>
        {error && <p className="mt-3 text-sm text-primary">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleDemoExecute}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            execute
          </button>
          <button
            onClick={handleDemoCall}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-gray-50"
          >
            rework
          </button>
          <button
            onClick={() => { setDemoMode("idle"); setError(null); }}
            className="text-sm text-muted underline hover:text-foreground"
          >
            back
          </button>
        </div>
      </div>
    );
  }

  // wizard
  return (
    <div className="mx-auto max-w-lg pt-8">
      <h2 className="text-2xl font-bold text-foreground">start a new call</h2>
      <p className="mt-1 text-sm text-muted">
        enter the client details and pour a fresh discovery call.
      </p>

      {/* step indicators */}
      <div className="mt-4 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3;
          const isActive = step === stepNum;
          const isComplete = step > stepNum;
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${isComplete ? "bg-primary" : "bg-gray-300"}`} />}
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  isActive
                    ? "bg-primary text-white"
                    : isComplete
                      ? "bg-primary/20 text-primary"
                      : "bg-gray-200 text-muted"
                }`}
              >
                {stepNum}
              </div>
              <span className={`text-xs ${isActive ? "font-medium text-foreground" : "text-muted"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        {step === 1 && (
          <WizardStepClient
            clientMode={clientMode}
            setClientMode={setClientMode}
            selectedClient={selectedClient}
            setSelectedClient={setSelectedClient}
            clientName={clientName}
            setClientName={setClientName}
            industry={industry}
            setIndustry={setIndustry}
            contactName={contactName}
            setContactName={setContactName}
            contactEmail={contactEmail}
            setContactEmail={setContactEmail}
            owner={owner}
            setOwner={setOwner}
            employees={employees}
            error={error}
          />
        )}

        {step === 2 && (
          <WizardStepCodebase
            clientMode={clientMode}
            clientId={getClientId()}
            codebaseMode={codebaseMode}
            setCodebaseMode={setCodebaseMode}
            uploadedCodebaseId={uploadedCodebaseId}
            setUploadedCodebaseId={setUploadedCodebaseId}
            uploadedFilename={uploadedFilename}
            setUploadedFilename={setUploadedFilename}
            selectedCodebaseId={selectedCodebaseId}
            setSelectedCodebaseId={setSelectedCodebaseId}
            setSelectedCodebaseName={setSelectedCodebaseName}
            error={error}
            setError={setError}
          />
        )}

        {step === 3 && (
          <WizardStepReview
            clientMode={clientMode}
            clientName={clientName}
            selectedClientName={selectedClient?.name ?? null}
            codebaseMode={codebaseMode}
            uploadedFilename={uploadedFilename}
            selectedCodebaseName={selectedCodebaseName}
            isLoading={isLoading}
            error={error}
            onStartCall={handleStartCall}
            onDemoCall={handleDemoCall}
          />
        )}
      </div>

      {/* navigation */}
      <div className="mt-6 flex items-center justify-between">
        {step > 1 ? (
          <button
            onClick={() => { setStep((step - 1) as 1 | 2 | 3); setError(null); }}
            className="text-sm text-muted underline hover:text-foreground"
          >
            back
          </button>
        ) : (
          <div />
        )}
        {step < 3 && (
          <button
            onClick={step === 1 ? advanceToStep2 : advanceToStep3}
            disabled={isLoading}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {isLoading ? "loading..." : "next"}
          </button>
        )}
      </div>
    </div>
  );
}
