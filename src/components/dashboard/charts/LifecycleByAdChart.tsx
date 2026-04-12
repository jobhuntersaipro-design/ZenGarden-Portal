"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { LIFECYCLE_ORDER } from "@/lib/dashboard/types";

const COLORS: Record<string, string> = {
  "New Lead": "#60a5fa",
  "Plan Selected": "#818cf8",
  "Supporting Document Pending": "#f59e0b",
  "Supporting Document Submitted": "#fbbf24",
  "Closing Script Agreed - Pending Human": "#a78bfa",
  "Pending Demand": "#fb923c",
  "Pending Installation": "#34d399",
  "Pending Transfer Request": "#2dd4bf",
  "Installation Done": "#22c55e",
  "Installation Done - Pending Free Gift": "#16a34a",
  "Installation Done - Free Gift Done": "#15803d",
  "Follow Up": "#94a3b8",
  "Cold Lead": "#ef4444",
};

interface Props {
  data: { adName: string; lifecycle: string; count: number }[];
}

export default function LifecycleByAdChart({ data }: Props) {
  const adNames = [...new Set(data.map((d) => d.adName))];
  const lifecycles = LIFECYCLE_ORDER.filter((lc) =>
    data.some((d) => d.lifecycle === lc)
  );

  const chartData = adNames.map((ad) => {
    const row: Record<string, string | number> = { adName: ad };
    for (const lc of lifecycles) {
      row[lc] = data.find((d) => d.adName === ad && d.lifecycle === lc)?.count ?? 0;
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" />
        <YAxis
          dataKey="adName"
          type="category"
          width={180}
          tick={{ fontSize: 12 }}
        />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {lifecycles.map((lc) => (
          <Bar
            key={lc}
            dataKey={lc}
            stackId="a"
            fill={COLORS[lc] ?? "#94a3b8"}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
