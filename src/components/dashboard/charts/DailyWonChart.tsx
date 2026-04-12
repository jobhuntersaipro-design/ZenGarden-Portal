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
  Line,
  ComposedChart,
} from "recharts";
import type { LifecycleEvent } from "@/lib/dashboard/types";

const WON_STAGES = new Set([
  "Installation Done",
  "Installation Done - Free Gift Done",
  "Installation Done - Pending Free Gift",
]);

interface Props {
  events: LifecycleEvent[];
  adNameByContact: Record<number, string>;
}

export default function DailyWonChart({ events, adNameByContact }: Props) {
  const wonEvents = events.filter((e) => WON_STAGES.has(e.lifecycleName));
  const pendingEvents = events.filter(
    (e) => e.lifecycleName === "Pending Installation"
  );

  // Group by date
  const dateMap = new Map<
    string,
    { won: number; pending: number; weighted: number; byAd: Record<string, number> }
  >();

  for (const e of wonEvents) {
    const d = dateMap.get(e.date) ?? { won: 0, pending: 0, weighted: 0, byAd: {} };
    d.won++;
    const ad = adNameByContact[e.contactId] ?? "Unknown";
    d.byAd[ad] = (d.byAd[ad] ?? 0) + 1;
    dateMap.set(e.date, d);
  }

  for (const e of pendingEvents) {
    const d = dateMap.get(e.date) ?? { won: 0, pending: 0, weighted: 0, byAd: {} };
    d.pending++;
    dateMap.set(e.date, d);
  }

  for (const [, v] of dateMap) {
    v.weighted = Math.round((v.won + v.pending * 0.7) * 10) / 10;
  }

  const chartData = [...dateMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date: date.slice(5),
      Won: d.won,
      "Pending (x0.7)": Math.round(d.pending * 0.7 * 10) / 10,
      "Weighted Total": d.weighted,
    }));

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar
          dataKey="Won"
          stackId="a"
          fill="#22c55e"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="Pending (x0.7)"
          stackId="a"
          fill="#86efac"
          radius={[4, 4, 0, 0]}
        />
        <Line
          type="monotone"
          dataKey="Weighted Total"
          stroke="#15803d"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
