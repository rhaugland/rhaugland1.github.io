"use client";

import React, { useState } from "react";
import { StatCard } from "@slushie/prototype-kit/src/components/stat-card";
import { DataTable } from "@slushie/prototype-kit/src/components/data-table";
import { Form } from "@slushie/prototype-kit/src/components/form";
import { Chart } from "@slushie/prototype-kit/src/components/chart";
import { NavBar } from "@slushie/prototype-kit/src/components/nav-bar";
import { layoutConfigs } from "@slushie/prototype-kit/src/layouts/index";
import type {
  PrototypeManifest,
  ManifestPage,
  ManifestDesignPreferences,
} from "@slushie/prototype-kit/src/renderer/types";

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  "stat-card": StatCard,
  "data-table": DataTable,
  form: Form,
  chart: Chart,
  "nav-bar": NavBar,
};

function PageRenderer({ page, isDark }: { page: ManifestPage; isDark: boolean }) {
  const layoutConfig = layoutConfigs[page.layout] ?? layoutConfigs.dashboard;
  const navComponents = page.components.filter((c) => c.type === "nav-bar");
  const bodyComponents = page.components.filter(
    (c) => c.type !== "nav-bar" && c.type !== "walkthrough-overlay"
  );

  return (
    <div>
      {navComponents.map((comp) => {
        const Component = COMPONENT_MAP[comp.type];
        if (!Component) return null;
        return (
          <div key={comp.id} data-component-id={comp.id}>
            <Component {...comp.props} data={comp.data} />
          </div>
        );
      })}

      <div className="px-6 py-4">
        <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
          {page.title}
        </h1>
      </div>

      <div className={`px-6 pb-6 ${layoutConfig.className}`}>
        {bodyComponents.map((comp) => {
          const Component = COMPONENT_MAP[comp.type];
          if (!Component) {
            return (
              <div
                key={comp.id}
                className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400"
              >
                unknown component: {comp.type}
              </div>
            );
          }
          return (
            <div key={comp.id} data-component-id={comp.id}>
              <Component {...comp.props} data={comp.data} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ManifestRendererProps {
  manifest: PrototypeManifest;
  themeOverride?: "dark" | "light";
}

export function ManifestRenderer({ manifest, themeOverride }: ManifestRendererProps) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const pages = manifest.pages ?? [];
  const design = manifest.designPreferences;
  const isDark = themeOverride ? themeOverride === "dark" : (design?.theme === "dark");
  const accentColor = design?.accentColor ?? "#DC2626";

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">no pages in this prototype.</p>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];

  const bgStyle: React.CSSProperties = isDark
    ? { backgroundColor: design?.backgroundColor ?? "#111827", color: "#f3f4f6" }
    : {};

  const fontStyle: React.CSSProperties = {};
  if (design?.fontBody) {
    fontStyle.fontFamily = `${design.fontBody}, system-ui, sans-serif`;
  }

  return (
    <div className="flex h-full flex-col" style={{ ...bgStyle, ...fontStyle }}>
      {/* page tabs when multiple pages */}
      {pages.length > 1 && (
        <div
          className={`flex border-b px-4 ${
            isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
          }`}
        >
          {pages.map((page, i) => (
            <button
              key={page.route}
              onClick={() => setCurrentPageIndex(i)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                i === currentPageIndex
                  ? "border-current"
                  : isDark
                    ? "border-transparent text-gray-400 hover:text-gray-200"
                    : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
              style={
                i === currentPageIndex ? { color: accentColor, borderColor: accentColor } : {}
              }
            >
              {page.title}
            </button>
          ))}
        </div>
      )}

      {/* integrations banner */}
      {manifest.simulatedIntegrations?.length > 0 && (
        <div
          className={`flex items-center gap-3 border-b px-4 py-2 ${
            isDark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-blue-50"
          }`}
        >
          <span className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-blue-700"}`}>
            connected:
          </span>
          {manifest.simulatedIntegrations.map((integration) => (
            <span
              key={integration.name}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                isDark ? "bg-gray-700 text-gray-200" : "bg-blue-100 text-blue-800"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {integration.name}
            </span>
          ))}
        </div>
      )}

      {/* page content */}
      <div className="flex-1 overflow-y-auto">
        <PageRenderer page={currentPage} isDark={isDark} />
      </div>
    </div>
  );
}
