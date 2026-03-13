"use client";

import { useState, useCallback } from "react";

interface WalkthroughStep {
  target_component: string;
  step: number;
  text: string;
}

interface PreviewClientProps {
  nanoid: string;
  clientName: string;
  prototypeUrl: string | null;
  walkthroughSteps: WalkthroughStep[];
}

function WalkthroughOverlay({
  steps,
  currentIndex,
  onNext,
  onPrev,
  onClose,
}: {
  steps: WalkthroughStep[];
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const step = steps[currentIndex];
  if (!step) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === steps.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* semi-transparent backdrop */}
      <div className="pointer-events-auto absolute inset-0 bg-black/20" />

      {/* tooltip card — positioned center bottom */}
      <div className="pointer-events-auto absolute bottom-8 left-1/2 w-full max-w-md -translate-x-1/2 px-4">
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          {/* step counter */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                {currentIndex + 1}
              </span>
              <span className="text-xs text-muted">
                step {currentIndex + 1} of {steps.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors"
              aria-label="close walkthrough"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* highlighted section name */}
          <p className="mb-1 text-xs font-semibold text-secondary">
            {step.target_component}
          </p>

          {/* step description */}
          <p className="text-sm text-foreground leading-relaxed">{step.text}</p>

          {/* progress dots */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentIndex
                    ? "w-4 bg-primary"
                    : i < currentIndex
                    ? "w-1.5 bg-primary/40"
                    : "w-1.5 bg-gray-300"
                }`}
              />
            ))}
          </div>

          {/* navigation buttons */}
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={onPrev}
              disabled={isFirst}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                isFirst
                  ? "text-muted cursor-not-allowed"
                  : "text-foreground hover:bg-gray-100"
              }`}
            >
              back
            </button>
            <button
              onClick={isLast ? onClose : onNext}
              className="rounded-full bg-primary px-6 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105"
            >
              {isLast ? "got it" : "next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PreviewClient({
  nanoid,
  clientName,
  prototypeUrl,
  walkthroughSteps,
}: PreviewClientProps) {
  const [showWalkthrough, setShowWalkthrough] = useState(walkthroughSteps.length > 0);
  const [walkthroughIndex, setWalkthroughIndex] = useState(0);

  const handleNext = useCallback(() => {
    setWalkthroughIndex((prev) =>
      prev < walkthroughSteps.length - 1 ? prev + 1 : prev
    );
  }, [walkthroughSteps.length]);

  const handlePrev = useCallback(() => {
    setWalkthroughIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const handleClose = useCallback(() => {
    setShowWalkthrough(false);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* slushie branding frame — top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-lg font-extrabold text-primary">slushie</span>
          <span className="text-xs text-muted">
            built for {clientName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {walkthroughSteps.length > 0 && !showWalkthrough && (
            <button
              onClick={() => {
                setWalkthroughIndex(0);
                setShowWalkthrough(true);
              }}
              className="rounded-full border border-secondary px-3 py-1 text-xs font-semibold text-secondary transition-colors hover:bg-secondary hover:text-white"
            >
              replay walkthrough
            </button>
          )}
          <span className="text-[10px] text-muted">prototype preview</span>
        </div>
      </div>

      {/* prototype content area */}
      <div className="relative flex-1">
        {prototypeUrl ? (
          <iframe
            src={prototypeUrl}
            className="h-full w-full border-none"
            title={`${clientName} prototype`}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex h-full items-center justify-center slushie-gradient">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">
                your prototype is being prepared.
              </p>
              <p className="mt-2 text-sm text-muted">
                check back soon — we're putting the finishing touches on it.
              </p>
            </div>
          </div>
        )}

        {/* walkthrough overlay */}
        {showWalkthrough && walkthroughSteps.length > 0 && (
          <WalkthroughOverlay
            steps={walkthroughSteps}
            currentIndex={walkthroughIndex}
            onNext={handleNext}
            onPrev={handlePrev}
            onClose={handleClose}
          />
        )}
      </div>

      {/* slushie branding frame — bottom bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted">
            this is a prototype. some features use simulated data.
          </p>
          <p className="text-[10px] text-muted">powered by slushie</p>
        </div>
      </div>
    </div>
  );
}
