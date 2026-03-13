"use client";

import React, { useState } from "react";

export interface FormProps {
  title: string;
  description?: string;
  data: {
    fields: {
      name: string;
      label: string;
      type: "text" | "number" | "email" | "select" | "date" | "textarea";
      options?: string[];
      required: boolean;
    }[];
    submitLabel: string;
    submitEndpoint: string;
  };
}

export function Form({ title, data }: FormProps) {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        {data.fields.map((field) => (
          <div key={field.name}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            {field.type === "textarea" ? (
              <textarea
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
              />
            ) : field.type === "select" ? (
              <select
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">select...</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                name={field.name}
                required={field.required}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          {submitted ? "saved" : data.submitLabel}
        </button>
      </form>
    </div>
  );
}
