"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { DailySummary } from "@/lib/dashboard/types";

interface Props {
  data: DailySummary[];
}

export default function DailyChart({ data }: Props) {
  const chartData = data.map((d) => ({
    date: d.date.slice(5),
    "New Leads": d.newLeads,
    Conversions: d.conversions,
    "Lifecycle Movements": d.totalMovements,
  }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Area
          type="monotone"
          dataKey="New Leads"
          stackId="1"
          stroke="#60a5fa"
          fill="#60a5fa"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="Conversions"
          stackId="2"
          stroke="#22c55e"
          fill="#22c55e"
          fillOpacity={0.6}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
