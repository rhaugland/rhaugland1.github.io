"use client";

import React, { useState, useEffect } from "react";

export interface WalkthroughStep {
  targetComponentId: string;
  targetPage: string;
  step: number;
  title: string;
  text: string;
}

export interface WalkthroughOverlayProps {
  title?: string;
  description?: string;
  data: Record<string, never>;
  steps: WalkthroughStep[];
  currentPage: string;
}

export function WalkthroughOverlay({ steps, currentPage }: WalkthroughOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const pageSteps = steps.filter((s) => s.targetPage === currentPage);

  useEffect(() => {
    setCurrentStep(0);
    setDismissed(false);
  }, [currentPage]);

  if (dismissed || pageSteps.length === 0) return null;

  const step = pageSteps[currentStep];
  if (!step) return null;

  const isLast = currentStep >= pageSteps.length - 1;
  const globalStepNumber = step.step;
  const totalSteps = steps.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">
            step {globalStepNumber} of {totalSteps}
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            skip tour
          </button>
        </div>
        <h4 className="text-lg font-semibold text-gray-900">{step.title}</h4>
        <p className="mt-2 text-sm text-gray-600">{step.text}</p>
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            disabled={currentStep === 0}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-30"
          >
            back
          </button>
          <button
            onClick={() => {
              if (isLast) {
                setDismissed(true);
              } else {
                setCurrentStep((s) => s + 1);
              }
            }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {isLast ? "got it" : "next"}
          </button>
        </div>
        {/* progress dots */}
        <div className="mt-3 flex justify-center gap-1">
          {pageSteps.map((_, i) => (
            <span
              key={i}
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                i === currentStep ? "bg-red-600" : "bg-gray-300"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
