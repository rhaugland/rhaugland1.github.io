"use client";

import React from "react";

export interface ChartProps {
  title: string;
  description?: string;
  data: {
    chartType: "bar" | "line" | "pie" | "donut";
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      color: string;
    }[];
  };
}

/**
 * lightweight chart using pure css/svg — no chart library dependency.
 * keeps prototype-kit small and self-contained.
 */
export function Chart({ title, data }: ChartProps) {
  const maxValue = Math.max(
    ...data.datasets.flatMap((ds) => ds.data),
    1
  );

  if (data.chartType === "bar") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-end gap-2" style={{ height: 200 }}>
          {data.labels.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              {data.datasets.map((ds) => (
                <div
                  key={ds.label}
                  className="w-full rounded-t"
                  style={{
                    height: `${(ds.data[i] / maxValue) * 160}px`,
                    backgroundColor: ds.color,
                    minHeight: 4,
                  }}
                  title={`${ds.label}: ${ds.data[i]}`}
                />
              ))}
              <span className="mt-1 text-xs text-gray-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-4">
          {data.datasets.map((ds) => (
            <div key={ds.label} className="flex items-center gap-1 text-xs text-gray-600">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: ds.color }}
              />
              {ds.label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // pie/donut
  if (data.chartType === "pie" || data.chartType === "donut") {
    const total = data.datasets[0]?.data.reduce((a, b) => a + b, 0) ?? 1;
    let cumulativePercent = 0;

    const segments = data.labels.map((label, i) => {
      const value = data.datasets[0]?.data[i] ?? 0;
      const percent = (value / total) * 100;
      const startPercent = cumulativePercent;
      cumulativePercent += percent;
      return { label, percent, startPercent, color: data.datasets[0]?.color ?? "#DC2626", value };
    });

    const colors = ["#DC2626", "#3B5BDB", "#059669", "#D97706", "#7C3AED", "#0891B2"];

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 32 32" className="h-32 w-32" style={{ transform: "rotate(-90deg)" }}>
            {segments.map((seg, i) => (
              <circle
                key={seg.label}
                r="16"
                cx="16"
                cy="16"
                fill="transparent"
                stroke={colors[i % colors.length]}
                strokeWidth={data.chartType === "donut" ? "6" : "16"}
                strokeDasharray={`${seg.percent} ${100 - seg.percent}`}
                strokeDashoffset={`-${seg.startPercent}`}
                pathLength="100"
              />
            ))}
          </svg>
          <div className="space-y-1">
            {segments.map((seg, i) => (
              <div key={seg.label} className="flex items-center gap-2 text-xs text-gray-600">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                {seg.label}: {seg.value}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // line chart — simple svg polyline
  const svgWidth = 400;
  const svgHeight = 160;
  const padding = 20;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight + 20}`} className="w-full">
        {data.datasets.map((ds) => {
          const points = ds.data
            .map((val, i) => {
              const x = padding + (i / (ds.data.length - 1 || 1)) * (svgWidth - 2 * padding);
              const y = svgHeight - padding - (val / maxValue) * (svgHeight - 2 * padding);
              return `${x},${y}`;
            })
            .join(" ");

          return (
            <polyline
              key={ds.label}
              points={points}
              fill="none"
              stroke={ds.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {data.labels.map((label, i) => {
          const x = padding + (i / (data.labels.length - 1 || 1)) * (svgWidth - 2 * padding);
          return (
            <text key={label} x={x} y={svgHeight + 12} textAnchor="middle" className="text-xs" fill="#6b7280" fontSize="10">
              {label}
            </text>
          );
        })}
      </svg>
      <div className="mt-2 flex gap-4">
        {data.datasets.map((ds) => (
          <div key={ds.label} className="flex items-center gap-1 text-xs text-gray-600">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: ds.color }} />
            {ds.label}
          </div>
        ))}
      </div>
    </div>
  );
}
