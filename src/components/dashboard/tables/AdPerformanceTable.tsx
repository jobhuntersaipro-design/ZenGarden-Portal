"use client";

import { useState } from "react";
import type { AdPerformance } from "@/lib/dashboard/types";

interface Props {
  data: AdPerformance[];
}

export default function AdPerformanceTable({ data }: Props) {
  const [sortBy, setSortBy] = useState<keyof AdPerformance>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = [...data].sort((a, b) => {
    const av = a[sortBy] as number;
    const bv = b[sortBy] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function toggleSort(col: keyof AdPerformance) {
    if (sortBy === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  const arrow = (col: keyof AdPerformance) =>
    sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pb-2 pr-4 font-medium">Ad Name</th>
            {(
              [
                ["total", "Leads"],
                ["won", "Won"],
                ["pendingInstallation", "Pending"],
                ["weightedWins", "Weighted"],
                ["winRate", "Win Rate"],
              ] as [keyof AdPerformance, string][]
            ).map(([key, label]) => (
              <th
                key={key}
                className="cursor-pointer pb-2 pr-4 font-medium text-right hover:text-gray-900"
                onClick={() => toggleSort(key)}
              >
                {label}
                {arrow(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.adName} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-4 font-medium max-w-48 truncate">
                {row.adName}
              </td>
              <td className="py-2 pr-4 text-right">{row.total}</td>
              <td className="py-2 pr-4 text-right text-green-600 font-semibold">
                {row.won}
              </td>
              <td className="py-2 pr-4 text-right text-amber-600">
                {row.pendingInstallation}
              </td>
              <td className="py-2 pr-4 text-right">{row.weightedWins}</td>
              <td className="py-2 pr-4 text-right">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${
                    row.winRate >= 10
                      ? "bg-green-100 text-green-700"
                      : row.winRate >= 5
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {row.winRate}%
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
