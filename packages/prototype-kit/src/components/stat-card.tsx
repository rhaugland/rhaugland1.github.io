"use client";

import React from "react";

export interface StatCardProps {
  title: string;
  description?: string;
  data: {
    value: string;
    change: string;
    trend: "up" | "down" | "flat";
  };
}

export function StatCard({ title, data }: StatCardProps) {
  const trendColor =
    data.trend === "up"
      ? "text-green-600"
      : data.trend === "down"
        ? "text-red-600"
        : "text-gray-500";

  const trendArrow =
    data.trend === "up" ? "^" : data.trend === "down" ? "v" : "-";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-gray-900">{data.value}</p>
        <span className={`text-sm font-medium ${trendColor}`}>
          {trendArrow} {data.change}
        </span>
      </div>
    </div>
  );
}
