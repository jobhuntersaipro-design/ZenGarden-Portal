"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Label,
} from "recharts";
import type { AdPerformance } from "@/lib/dashboard/types";

interface Props {
  data: AdPerformance[];
}

export default function WinRateChart({ data }: Props) {
  const filtered = data.filter((d) => d.total >= 3);

  const chartData = filtered.map((d) => ({
    x: d.weightedWins,
    y: d.winRate,
    z: d.total,
    adName: d.adName,
    won: d.won,
    pending: d.pendingInstallation,
    total: d.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          type="number"
          dataKey="x"
          name="Weighted Wins"
          domain={[0, "auto"]}
        >
          <Label value="Weighted Won Cases" offset={-15} position="insideBottom" style={{ fontSize: 12, fill: "#6b7280" }} />
        </XAxis>
        <YAxis
          type="number"
          dataKey="y"
          name="Win Rate"
          unit="%"
          domain={[0, "auto"]}
        >
          <Label value="Win Rate %" angle={-90} position="insideLeft" style={{ fontSize: 12, fill: "#6b7280" }} />
        </YAxis>
        <ZAxis type="number" dataKey="z" range={[80, 800]} name="Total Leads" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.[0]) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-lg border bg-white p-3 shadow-md text-sm">
                <p className="font-semibold text-gray-900">{d.adName}</p>
                <div className="mt-1 space-y-0.5 text-gray-600">
                  <p>Win Rate: <span className="font-bold text-green-600">{d.y}%</span></p>
                  <p>Weighted Wins: <span className="font-bold">{d.x}</span></p>
                  <p>Installations Done: {d.won}</p>
                  <p>Pending Installation (x0.7): {d.pending}</p>
                  <p>Total Leads: {d.total}</p>
                </div>
              </div>
            );
          }}
        />
        <Scatter
          data={chartData}
          fill="#6366f1"
          fillOpacity={0.7}
          stroke="#4f46e5"
          strokeWidth={1}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
