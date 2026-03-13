"use client";

import { useEffect, useState } from "react";

interface TrackerStep {
  step: number;
  label: string;
  subtitle: string;
  status: "done" | "active" | "pending";
  completedAt: string | null;
}

interface TrackerClientProps {
  slug: string;
  clientName: string;
  initialSteps: TrackerStep[];
  currentStep: number;
  prototypeNanoid: string | null;
}

function StepIndicator({ status }: { status: "done" | "active" | "pending" }) {
  if (status === "done") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500">
        <svg
          className="h-5 w-5 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="relative flex h-10 w-10 items-center justify-center">
        <div className="absolute h-10 w-10 animate-ping rounded-full bg-primary opacity-25" />
        <div className="relative h-6 w-6 rounded-full bg-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300">
      <div className="h-3 w-3 rounded-full bg-gray-400" />
    </div>
  );
}

function StepConnector({ status }: { status: "done" | "active" | "pending" }) {
  return (
    <div className="mx-auto my-1 h-8 w-0.5">
      <div
        className={`h-full w-full transition-colors duration-500 ${
          status === "done" ? "bg-green-500" : "bg-gray-300"
        }`}
      />
    </div>
  );
}

export function TrackerClient({
  slug,
  clientName,
  initialSteps,
  currentStep: initialCurrentStep,
  prototypeNanoid,
}: TrackerClientProps) {
  const [steps, setSteps] = useState<TrackerStep[]>(initialSteps);
  const [currentStep, setCurrentStep] = useState(initialCurrentStep);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource(`/api/track/${slug}/events`);

    eventSource.addEventListener("connected", () => {
      setConnected(true);
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "tracker.update" && data.steps) {
          setSteps(data.steps);
          setCurrentStep(data.step);
        }
      } catch {
        // ignore malformed messages
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      // browser will auto-reconnect
    };

    return () => {
      eventSource.close();
    };
  }, [slug]);

  const isComplete = currentStep === 5 && steps[4]?.status === "done";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center slushie-gradient px-4">
      <div className="w-full max-w-md">
        {/* header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-extrabold text-primary">slushie</h1>
          <p className="mt-2 text-foreground text-sm">
            {isComplete
              ? `${clientName}, your tool is ready.`
              : `hey ${clientName} — we're blending something for you.`}
          </p>
          {connected && !isComplete && (
            <p className="mt-1 text-xs text-muted">live updates</p>
          )}
        </div>

        {/* step list */}
        <div className="rounded-2xl bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          {steps.map((step, index) => (
            <div key={step.step}>
              <div className="flex items-center gap-4">
                <StepIndicator status={step.status} />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${
                      step.status === "active"
                        ? "text-primary"
                        : step.status === "done"
                        ? "text-foreground"
                        : "text-muted"
                    }`}
                  >
                    {step.label}
                  </p>
                  <p
                    className={`text-xs ${
                      step.status === "pending" ? "text-muted/50" : "text-muted"
                    }`}
                  >
                    {step.subtitle}
                  </p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="ml-5">
                  <StepConnector status={steps[index + 1].status === "pending" ? "pending" : "done"} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* prototype link — only shows when ready */}
        {isComplete && prototypeNanoid && (
          <div className="mt-6 text-center">
            <a
              href={`/preview/${prototypeNanoid}`}
              className="inline-block rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
            >
              take a look
            </a>
          </div>
        )}

        {/* auto-refresh hint */}
        {!isComplete && currentStep > 0 && (
          <p className="mt-6 text-center text-xs text-muted">
            this page updates automatically. no need to refresh.
          </p>
        )}
      </div>

      {/* footer */}
      <div className="mt-12 text-center text-xs text-muted/60">
        <p>powered by slushie</p>
      </div>
    </main>
  );
}
