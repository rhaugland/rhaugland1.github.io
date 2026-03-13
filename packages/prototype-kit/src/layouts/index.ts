import React from "react";

export type LayoutType = "dashboard" | "form" | "list-detail" | "calendar" | "table";

/**
 * layout configuration for each page type.
 * the renderer uses these to wrap components in the appropriate grid/flex structure.
 */
export const layoutConfigs: Record<LayoutType, { className: string; description: string }> = {
  dashboard: {
    className: "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3",
    description: "multi-column grid for stat cards and charts",
  },
  form: {
    className: "mx-auto max-w-2xl space-y-6",
    description: "centered single-column for forms",
  },
  "list-detail": {
    className: "grid grid-cols-1 gap-6 lg:grid-cols-3",
    description: "sidebar list + main detail area",
  },
  calendar: {
    className: "space-y-6",
    description: "full-width calendar view",
  },
  table: {
    className: "space-y-6",
    description: "full-width table with optional filters",
  },
};
