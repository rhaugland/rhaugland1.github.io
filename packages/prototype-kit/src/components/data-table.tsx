"use client";

import React from "react";

export interface DataTableProps {
  title: string;
  description?: string;
  data: {
    columns: { key: string; label: string }[];
    rows: Record<string, unknown>[];
  };
}

export function DataTable({ title, data }: DataTableProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {data.columns.map((col) => (
                <th
                  key={col.key}
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                {data.columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">
                    {String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
