"use client";

import React from "react";
import { StatCard } from "../components/stat-card";
import { DataTable } from "../components/data-table";
import { Form } from "../components/form";
import { Chart } from "../components/chart";
import { NavBar } from "../components/nav-bar";
import { WalkthroughOverlay } from "../components/walkthrough-overlay";
import { layoutConfigs } from "../layouts";
import type { ManifestComponent, ManifestPage, ManifestWalkthroughStep } from "./types";

const COMPONENT_MAP: Record<string, React.ComponentType<any>> = {
  "stat-card": StatCard,
  "data-table": DataTable,
  form: Form,
  chart: Chart,
  "nav-bar": NavBar,
};

interface RenderPageProps {
  page: ManifestPage;
  walkthroughSteps: ManifestWalkthroughStep[];
  allPages: ManifestPage[];
}

export function RenderPage({ page, walkthroughSteps, allPages }: RenderPageProps) {
  const layoutConfig = layoutConfigs[page.layout] ?? layoutConfigs.dashboard;

  // separate nav-bar from other components — it renders outside the layout grid
  const navComponents = page.components.filter((c) => c.type === "nav-bar");
  const bodyComponents = page.components.filter((c) => c.type !== "nav-bar" && c.type !== "walkthrough-overlay");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* render nav bars */}
      {navComponents.map((comp) => {
        const Component = COMPONENT_MAP[comp.type];
        if (!Component) return null;
        return (
          <div key={comp.id} data-component-id={comp.id}>
            <Component {...comp.props} data={comp.data} />
          </div>
        );
      })}

      {/* page title */}
      <div className="px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">{page.title}</h1>
      </div>

      {/* body components in layout grid */}
      <div className={`px-6 pb-6 ${layoutConfig.className}`}>
        {bodyComponents.map((comp) => {
          const Component = COMPONENT_MAP[comp.type];
          if (!Component) {
            return (
              <div key={comp.id} className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400">
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

      {/* walkthrough overlay */}
      <WalkthroughOverlay
        steps={walkthroughSteps}
        currentPage={page.route}
        data={{} as Record<string, never>}
      />
    </div>
  );
}
