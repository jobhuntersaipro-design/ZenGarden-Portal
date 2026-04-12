"use client";

import { useState } from "react";
import type {
  AdPerformance,
  DailySummary,
  DailyMovement,
  Insight,
  LifecycleEvent,
} from "@/lib/dashboard/types";
import LifecycleByAdChart from "@/components/dashboard/charts/LifecycleByAdChart";
import WinRateChart from "@/components/dashboard/charts/WinRateChart";
import DailyChart from "@/components/dashboard/charts/DailyChart";
import DailyAdBreakdownChart from "@/components/dashboard/charts/DailyAdBreakdownChart";
import DailyWonChart from "@/components/dashboard/charts/DailyWonChart";
import AdPerformanceTable from "@/components/dashboard/tables/AdPerformanceTable";
import InsightPanel from "@/components/dashboard/InsightPanel";

interface Props {
  date: string;
  totalLeads: number;
  totalWon: number;
  totalPending: number;
  overallWinRate: number;
  adPerformance: AdPerformance[];
  lifecycleByAd: { adName: string; lifecycle: string; count: number }[];
  dailySummary: DailySummary[];
  dailyMovement: DailyMovement[];
  insights: Insight[];
  lifecycleEvents: LifecycleEvent[];
  adNameByContact: Record<number, string>;
}

type Tab = "overview" | "ads" | "daily" | "insights";

export default function DashboardClient({
  date,
  totalLeads,
  totalWon,
  totalPending,
  overallWinRate,
  adPerformance,
  lifecycleByAd,
  dailySummary,
  dailyMovement,
  insights,
  lifecycleEvents,
  adNameByContact,
}: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "ads", label: "Ad Performance" },
    { key: "daily", label: "Daily Breakdown" },
    { key: "insights", label: "Insights" },
  ];

  const openConvos = adPerformance.reduce(
    (s, a) =>
      s +
      Object.entries(a.lifecycleCounts)
        .filter(([k]) => k !== "Cold Lead")
        .reduce((ss, [, v]) => ss + v, 0),
    0
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto max-w-7xl flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Unifi Sales Dashboard
            </h1>
            <p className="text-sm text-gray-500">
              Data as of {date} &middot; {totalLeads.toLocaleString()} total leads
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        {/* KPI Cards - always visible */}
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Total Leads" value={totalLeads.toLocaleString()} />
          <KpiCard
            label="Won (Installed)"
            value={totalWon.toString()}
            sub={`+${totalPending} pending`}
            color="green"
          />
          <KpiCard
            label="Win Rate (Weighted)"
            value={`${overallWinRate}%`}
            color={overallWinRate >= 10 ? "green" : "amber"}
          />
          <KpiCard
            label="Active Pipeline"
            value={openConvos.toLocaleString()}
            sub={`excl. cold leads`}
          />
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <div className="space-y-6">
            <Card title="Conversations by Lifecycle per Ad">
              <LifecycleByAdChart data={lifecycleByAd} />
            </Card>
            <Card title="Win Rate by Ad (Scatter)">
              <p className="mb-2 text-sm text-gray-500">
                X = Weighted Won (Installation Done + Pending Installation x 0.7). Bubble size = total leads.
              </p>
              <WinRateChart data={adPerformance} />
            </Card>
            <Card title="Daily Won Cases Trend">
              <DailyWonChart events={lifecycleEvents} adNameByContact={adNameByContact} />
            </Card>
            <Card title="Ad Performance Summary">
              <AdPerformanceTable data={adPerformance} />
            </Card>
          </div>
        )}

        {tab === "ads" && (
          <div className="space-y-6">
            <Card title="Win Rate by Ad (Scatter)">
              <p className="mb-4 text-sm text-gray-500">
                X = Weighted Won (Installation Done + Pending Installation x 0.7). Y = Win Rate %. Bubble size = total leads.
              </p>
              <WinRateChart data={adPerformance} />
            </Card>
            <Card title="Lifecycle Distribution per Ad">
              <LifecycleByAdChart data={lifecycleByAd} />
            </Card>
            <Card title="Detailed Ad Performance">
              <AdPerformanceTable data={adPerformance} />
            </Card>
          </div>
        )}

        {tab === "daily" && (
          <div className="space-y-6">
            <Card title="Daily New Leads & Conversions">
              <DailyChart data={dailySummary} />
            </Card>
            <Card title="Daily Won Cases Trend">
              <DailyWonChart events={lifecycleEvents} adNameByContact={adNameByContact} />
            </Card>
            <Card title="Daily Leads by Ad Source">
              <DailyAdBreakdownChart data={dailySummary} />
            </Card>
            <Card title="Daily Summary">
              <DailySummaryTable data={dailySummary} />
            </Card>
          </div>
        )}

        {tab === "insights" && (
          <div className="space-y-6">
            <Card title="Key Insights">
              <InsightPanel insights={insights} />
            </Card>
            <Card title="Lifecycle Events Timeline">
              <p className="mb-2 text-sm text-gray-500">
                {lifecycleEvents.length.toLocaleString()} lifecycle changes tracked
              </p>
              <LifecycleTimeline events={lifecycleEvents.slice(0, 100)} />
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "amber" | "red";
}) {
  const colorClass =
    color === "green"
      ? "text-green-600"
      : color === "amber"
        ? "text-amber-600"
        : color === "red"
          ? "text-red-600"
          : "text-gray-900";

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colorClass}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}

function DailySummaryTable({ data }: { data: DailySummary[] }) {
  const recent = [...data].reverse().slice(0, 14);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="pb-2 pr-4 font-medium">Date</th>
            <th className="pb-2 pr-4 font-medium text-right">New Leads</th>
            <th className="pb-2 pr-4 font-medium text-right">Conversions</th>
            <th className="pb-2 pr-4 font-medium text-right">Movements</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((row) => (
            <tr
              key={row.date}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="py-2 pr-4 font-medium">{row.date}</td>
              <td className="py-2 pr-4 text-right">{row.newLeads}</td>
              <td className="py-2 pr-4 text-right text-green-600 font-semibold">
                {row.conversions}
              </td>
              <td className="py-2 pr-4 text-right text-gray-500">
                {row.totalMovements}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LifecycleTimeline({ events }: { events: LifecycleEvent[] }) {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  return (
    <div className="max-h-96 overflow-y-auto space-y-2">
      {sorted.map((e, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-gray-100 p-3 text-sm"
        >
          <span className="text-xs text-gray-400 w-20 shrink-0">
            {e.date}
          </span>
          <span className="font-mono text-xs text-gray-400">
            #{e.contactId}
          </span>
          {e.previousLifecycleName && (
            <>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                {e.previousLifecycleName}
              </span>
              <span className="text-gray-400">&rarr;</span>
            </>
          )}
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {e.lifecycleName}
          </span>
        </div>
      ))}
    </div>
  );
}
