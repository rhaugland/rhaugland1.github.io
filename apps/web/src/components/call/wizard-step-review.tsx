"use client";

interface StepReviewProps {
  clientMode: "new" | "existing";
  clientName: string;
  selectedClientName: string | null;
  codebaseMode: "new" | "upload" | "previous";
  uploadedFilename: string | null;
  selectedCodebaseName: string | null;
  isLoading: boolean;
  error: string | null;
  onStartCall: () => void;
  onDemoCall: () => void;
}

export default function WizardStepReview({
  clientMode, clientName, selectedClientName,
  codebaseMode, uploadedFilename, selectedCodebaseName,
  isLoading, error, onStartCall, onDemoCall,
}: StepReviewProps) {
  const displayClientName = clientMode === "existing" ? selectedClientName : clientName;

  const codebaseLabel =
    codebaseMode === "new"
      ? "new project"
      : codebaseMode === "upload"
        ? `uploaded: ${uploadedFilename}`
        : `previous: ${selectedCodebaseName ?? "unnamed"}`;

  return (
    <div>
      <h3 className="text-lg font-semibold text-foreground">review & start</h3>

      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-muted">client</p>
          <p className="mt-1 text-sm text-foreground">
            {displayClientName}
            <span className="ml-2 text-muted">({clientMode})</span>
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase text-muted">codebase</p>
          <p className="mt-1 text-sm text-foreground">{codebaseLabel}</p>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-primary">{error}</p>}

      <div className="mt-6 flex gap-3">
        <button
          onClick={onStartCall}
          disabled={isLoading}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {isLoading ? "starting call..." : "start call"}
        </button>
        <button
          onClick={onDemoCall}
          disabled={isLoading}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-gray-50 disabled:opacity-50"
        >
          demo call
        </button>
      </div>
    </div>
  );
}
