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
import type { DailySummary } from "@/lib/dashboard/types";

const AD_COLORS: Record<string, string> = {
  "Google Ads": "#4285f4",
  "SpeedNet Internet Services": "#ea4335",
  "6 Months FREE on Every Plan": "#fbbc04",
  'Post: "Rumah baru atau sedang renovate?"': "#34a853",
  "Don't Pay for a Smart TV. Get It FREE with Unifi!": "#ff6d01",
  "api.whatsapp.com": "#25d366",
};

interface Props {
  data: DailySummary[];
}

export default function DailyAdBreakdownChart({ data }: Props) {
  const allAds = new Set<string>();
  for (const d of data) {
    for (const ad of Object.keys(d.byAd)) {
      allAds.add(ad);
    }
  }

  const topAds = [...allAds]
    .map((ad) => ({
      ad,
      total: data.reduce((s, d) => s + (d.byAd[ad]?.newLeads ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((a) => a.ad);

  const chartData = data.map((d) => {
    const row: Record<string, string | number> = { date: d.date.slice(5) };
    for (const ad of topAds) {
      row[ad] = d.byAd[ad]?.newLeads ?? 0;
    }
    return row;
  });

  const defaultColors = ["#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#06b6d4"];

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {topAds.map((ad, i) => (
          <Bar
            key={ad}
            dataKey={ad}
            stackId="a"
            fill={AD_COLORS[ad] ?? defaultColors[i % defaultColors.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
