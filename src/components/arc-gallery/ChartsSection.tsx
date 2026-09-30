"use client";

import { ActivityHeatmap, type ActivityDay } from "@/components/arc/activity-heatmap/activity-heatmap";
import { BarChart, type BarChartDatum } from "@/components/arc/bar-chart/bar-chart";
import { DonutChart, type DonutChartDatum } from "@/components/arc/donut-chart/donut-chart";
import { Gauge } from "@/components/arc/gauge/gauge";
import {
  LineChart,
  type LineChartDatum,
  type LineChartSeries,
} from "@/components/arc/line-chart/line-chart";
import { SlopeChart, type SlopeItem } from "@/components/arc/slope-chart/slope-chart";
import { Sparkline } from "@/components/arc/sparkline/sparkline";
import { formatMYR } from "@/lib/money";

import { GalleryGroup, Specimen } from "./Specimen";

/*
 * Every figure below is fixture data computed once at module load from fixed
 * dates and a fixed formula: no `Date.now()`, no `Math.random()`, so the
 * server render and the client render are the same markup.
 */

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A calendar day `offset` days after a fixed UTC date. */
function dayAt(startUtc: number, offset: number) {
  const date = new Date(startUtc + offset * DAY_MS);
  return {
    iso: date.toISOString().slice(0, 10),
    day: date.getUTCDate(),
    month: MONTHS[date.getUTCMonth()],
    year: date.getUTCFullYear(),
    weekday: WEEKDAYS[date.getUTCDay()],
    weekend: date.getUTCDay() === 0 || date.getUTCDay() === 6,
  };
}

/** A repeatable 0–1 value for index `i` and stream `seed`. */
function wobble(i: number, seed: number) {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43_758.5453;
  return x - Math.floor(x);
}

const money = (value: number) => formatMYR(String(Math.round(value)), 0);
/** Axis ticks in thousands, so `RM 24k` fits the chart's narrow value column. */
const moneyTick = (value: number) =>
  value === 0 ? formatMYR("0", 0) : `${formatMYR(String(Math.round(value / 1000)), 0)}k`;

// ── Line chart: 30 days of sales in three markets ───────────────────────────

const SEP_1_2026 = Date.UTC(2026, 8, 1);

const MARKETS: LineChartSeries[] = [
  { key: "vietnam", label: "Vietnam", color: "var(--arc-series-1)" },
  { key: "mydin", label: "Mydin", color: "var(--arc-series-2)" },
  { key: "malaysia", label: "Malaysia", color: "var(--arc-series-3)" },
];

const SALES_DAYS: LineChartDatum[] = Array.from({ length: 30 }, (_, i) => {
  const d = dayAt(SEP_1_2026, i);
  const quiet = d.weekend ? 0.45 : 1;
  return {
    key: d.iso,
    label: `${d.weekday}, ${d.day} ${d.month} ${d.year}`,
    axisLabel: i % 7 === 0 ? `${d.day} ${d.month}` : undefined,
    values: {
      vietnam: Math.round((9_000 + i * 180 + wobble(i, 1) * 6_000) * quiet),
      mydin: Math.round((8_000 + wobble(i, 2) * 7_500) * quiet),
      malaysia: Math.round((5_000 + i * 90 + wobble(i, 3) * 4_000) * quiet),
    },
  };
});

// ── Bar chart: orders in hand at the end of each day ────────────────────────

const ORDERS_IN_HAND: BarChartDatum[] = Array.from({ length: 30 }, (_, i) => {
  const d = dayAt(SEP_1_2026, i);
  return {
    key: d.iso,
    label: `${d.weekday}, ${d.day} ${d.month} ${d.year}`,
    axisLabel: i % 7 === 0 ? `${d.day} ${d.month}` : undefined,
    value: Math.round(14 + i * 0.4 + wobble(i, 4) * 8),
  };
});

// ── Donut: sales by market ──────────────────────────────────────────────────

const SALES_BY_MARKET: DonutChartDatum[] = [
  { key: "vietnam", label: "Vietnam", value: 298_116 },
  { key: "mydin", label: "Mydin", value: 284_165 },
  { key: "malaysia", label: "Malaysia", value: 127_676 },
  { key: "none", label: "No market", value: 194_973 },
];

// ── Slope: market share against the period before ───────────────────────────

const MARKET_MIX: SlopeItem[] = [
  { key: "vietnam", label: "Vietnam", start: 29.4, end: 32.9 },
  { key: "mydin", label: "Mydin", start: 33.8, end: 31.4 },
  { key: "malaysia", label: "Malaysia", start: 15.1, end: 14.1 },
  { key: "none", label: "No market", start: 21.7, end: 21.6 },
];

const percent = (value: number) => `${value.toFixed(1)}%`;
const points = (change: number) =>
  `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(1)} pp`;

// ── Sparklines: twelve weeks of sales per buyer ─────────────────────────────

const JUL_6_2026 = Date.UTC(2026, 6, 6);
const WEEK_LABELS = Array.from({ length: 12 }, (_, i) => {
  const d = dayAt(JUL_6_2026, i * 7);
  return `Week of ${d.day} ${d.month}`;
});

const BUYERS = [
  { name: "Meridian Chemicals Sdn Bhd", seed: 5, drift: 260, tone: "success" as const },
  { name: "Tanjung Electrical", seed: 6, drift: 0, tone: "accent" as const },
  { name: "Sunway Packaging", seed: 7, drift: -220, tone: "danger" as const },
].map((buyer) => {
  const weeks = Array.from({ length: 12 }, (_, i) =>
    Math.round(4_000 + i * buyer.drift + wobble(i, buyer.seed) * 2_500),
  );
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const change = Math.round(((last - first) / first) * 100);
  return {
    ...buyer,
    weeks,
    total: weeks.reduce((sum, value) => sum + value, 0),
    change: `${change >= 0 ? "+" : "−"}${Math.abs(change)}%`,
  };
});

// ── Heatmap: purchase orders per day for one buyer, Oct 2025 – Sep 2026 ─────

const OCT_1_2025 = Date.UTC(2025, 9, 1);
const HEATMAP_LENGTH = (Date.UTC(2026, 8, 30) - OCT_1_2025) / DAY_MS + 1;

const ORDER_DAYS: ActivityDay[] = Array.from({ length: HEATMAP_LENGTH }, (_, i) => {
  const d = dayAt(OCT_1_2025, i);
  const roll = wobble(i, 8);
  const count = d.weekend ? (roll > 0.9 ? 1 : 0) : roll > 0.55 ? Math.floor(roll * 5) - 1 : 0;
  return { date: d.iso, count: Math.max(0, count) };
});

const ORDER_UNIT = { one: "purchase order", other: "purchase orders" };

export function ChartsSection() {
  return (
    <GalleryGroup id="charts" title="Charts">
      <Specimen
        name="line-chart"
        job="Sales over time; the trend by market, buyer or product."
        phase={2}
        wide
      >
        <LineChart
          data={SALES_DAYS}
          series={MARKETS}
          label="Sales per day by market"
          categoryLabel="Day"
          formatValue={(value) => money(value)}
          formatTick={moneyTick}
        />
      </Specimen>

      <Specimen
        name="bar-chart"
        job="The order stage board: orders in hand per day."
        phase={2}
        wide
      >
        <BarChart
          data={ORDERS_IN_HAND}
          label="Orders in hand"
          period="1–30 Sep 2026"
          unit="orders"
          averageLabel="Daily average in hand"
          valueLabel="In hand"
          categoryLabel="Day"
        />
      </Specimen>

      <Specimen name="donut-chart" job="Sales by market; what a buyer buys." phase={2}>
        <DonutChart
          data={SALES_BY_MARKET}
          label="Sales by market, 24 Aug – 22 Sep 2026"
          formatValue={(value) => money(value)}
          totalLabel="Total sales"
          size={248}
          otherLabel="Other"
        />
      </Specimen>

      <Specimen name="slope-chart" job="Market mix against the period before." phase={2}>
        <SlopeChart
          data={MARKET_MIX}
          label="Share of sales by market"
          startLabel="Previous 30 days"
          endLabel="Last 30 days"
          formatValue={percent}
          formatChange={(change) => points(change)}
          highlightKey="vietnam"
        />
      </Specimen>

      <Specimen name="sparkline" job="A trend inside a buyer row or a stock row." phase={4}>
        <ul className="flex flex-col divide-y divide-hairline">
          {BUYERS.map((buyer) => (
            <li key={buyer.name} className="flex min-w-0 items-center gap-md py-sm">
              <span
                title={buyer.name}
                className="min-w-0 flex-1 truncate text-[length:var(--text-body-sm)] text-ink"
              >
                {buyer.name}
              </span>
              <div className="w-48 shrink-0">
                <Sparkline
                  data={buyer.weeks}
                  label="12 weeks"
                  value={money(buyer.total)}
                  change={buyer.change}
                  tone={buyer.tone}
                  labels={WEEK_LABELS}
                  formatValue={(value) => money(value)}
                  width={192}
                  height={40}
                />
              </div>
            </li>
          ))}
        </ul>
      </Specimen>

      <Specimen name="gauge" job="On-time delivery rate." phase={2}>
        <Gauge
          value={60}
          label="On-time delivery · Vietnam"
          detail="6 of 10 delivered orders"
          thresholds={[
            { from: 0, tone: "danger", label: "Behind" },
            { from: 70, tone: "warning", label: "Slipping" },
            { from: 90, tone: "success", label: "On track" },
          ]}
        />
      </Specimen>

      <Specimen
        name="activity-heatmap"
        job="Orders per day across a year, on a buyer page."
        phase={4}
        wide
      >
        <ActivityHeatmap
          days={ORDER_DAYS}
          label="Purchase orders per day, Oct 2025 to Sep 2026"
          period="Oct 2025 – Sep 2026"
          unit={ORDER_UNIT}
          weekStartsOn={1}
        />
      </Specimen>
    </GalleryGroup>
  );
}
