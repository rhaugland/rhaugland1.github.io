"use client";

import React from "react";

export interface NavBarProps {
  title?: string;
  description?: string;
  data: {
    brand: string;
    links: { label: string; href: string }[];
  };
}

export function NavBar({ data }: NavBarProps) {
  return (
    <nav className="border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center justify-between">
        <span className="text-lg font-extrabold text-red-600">
          {data.brand}
        </span>
        <div className="flex items-center gap-6">
          {data.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
