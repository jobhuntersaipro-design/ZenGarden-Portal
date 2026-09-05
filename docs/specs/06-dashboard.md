# Phase 06 — Dashboard

Branch `feature/dashboard`. Depends on: 05. Screen: design reference §3.2.
Load the `dataviz` skill before writing any chart.

Goal: `/` opens with what needs doing now, then explains the period. Every
range-driven number is computed from confirmed POs in Neon for one URL range
and one aggregation, and those cards redraw when either changes; the work
queue strip at the top is the one deliberate exception and never follows the
range.

## 1. Analytics library — `src/lib/analytics/` (pure, unit tested)

All functions take plain arrays of `{ id, buyerId, poDate, total, stage, lineItems[], stageEvents[] }`
already fetched for the range (and the previous period) and return plain
objects. No Prisma inside this folder.

| File | Exports | Definition (design reference §3.2 is authoritative) |
|---|---|---|
| `buckets.ts` | `makeBuckets(from, to, agg)`, `bucketKey(date, agg)` | KL-time boundaries; daily/weekly (Mon)/monthly/quarterly/yearly; empty buckets included |
| `sales.ts` | `salesSeries`, `kpis`, `previousPeriod` | totals per bucket, max/min (min over non-empty), average per bucket, total, count, avg PO, top buyer, delta vs previous period |
| `fulfillment.ts` | `stageSeries`, `stageBreakdown`, `openPipeline` | per-bucket count by *current* stage; open = stage ≠ DELIVERED; avg order→delivered days from events |
| `share.ts` | `shareBy(rows, key, valueFn, topN=5)` | top-N + "Other (n)", fixed categorical order |
| `churn.ts` | `buyerChurn(current, previous, allHistory)` | Lapsed, At risk, Churned rules; cadence = mean gap over full history |
| `price-drift.ts` | `priceDrift(current, previous)` | mean billed unit price per product, both periods, sorted by abs delta |
| `range.ts` | `parseRange(searchParams)` | presets → from/to; custom dates; default Last 30 days; clamps `to` to today |

`src/lib/queries/dashboard.ts#loadDashboard(range, agg)` runs the Prisma
queries (current range, previous period, buyer full history for churn,
extraction counts for the intake bar and failure rate) and calls the library.
Only latest revisions.

**The work queue is deliberately outside the range.** `loadDashboard` also
returns `workQueue` — counts of `Extraction` rows in `SUCCEEDED` (awaiting
review), `FAILED` and `RUNNING` (extracting now) — computed with **no date
filter at all**, whatever `?from`/`?to` say. It is what needs doing now, not
what happened in a window. Keep it in its own query so nobody accidentally
threads the range through it. Every other figure on the page follows the
range.

## 2. Page order and components

The page reads, top to bottom, in exactly this order:

1. **Work queue** — full width, first, and the heaviest thing on the page.
   Three columns divided by a coloured left border, each with a count at
   `text-display-lg`, a label and a one-line definition: **Awaiting review**
   (`brand-amber`, "Extracted and waiting for a person", action "Open review
   queue"), **Failed extractions** (`accent-red`, "Couldn't be read — retry or
   fill by hand", action "Open failed uploads"), **Extracting now**
   (`accent-blue`, "Claude is reading these", action "Watch the queue"). A
   zero count renders `ink-disabled`. The strip **ignores the date range**;
   its caption says so — "Always current — not affected by the date range".
   Actions link into `/purchase-orders?status=needs-review|failed|extracting`.
2. **KPI row, compact** — three tiles only: **Total sales**, **Purchase
   orders**, **Top buyer**. There is no "Awaiting review" tile; the work queue
   owns that number. Largest PO, New buyers, Top-3 concentration, Items per
   PO, Extraction failures and Open pipeline all live in the disclosure at 5.
3. **One trend** — a single card. **Fulfillment trend (`StackedStageChart`) is
   the default**; a segmented control in the card header switches it to **Sales
   over time** (`SalesLineChart`), state in `?trend=fulfillment|sales`. Only
   one chart renders at a time — never both stacked down the page.
4. **Status breakdown and stage bars** — the two `StatusBar`s, directly under
   the trend, because they explain the queue above.
5. **"More analytics" disclosure** — a collapsed-by-default section (state in
   `?more=1`, `aria-expanded`, no content mounted until opened) holding Market
   share by buyer, Market share by product, In this range, Buyer churn and
   Product price drift. **The donuts are not in the default view.**
6. **Purchase orders in range** — the table, last.

Components:

- `RangeControls` (client): the **preset chips are the primary control** and
  sit alone on the row. The From/To date inputs are hidden behind a "Custom
  range" toggle and render only when it is open, or when the URL already
  carries a custom range (in which case it starts open). The aggregation
  segmented control stays but is visually secondary — tertiary label, smaller,
  right of the chips. Writes `?from=&to=&agg=`. Chips highlight only when the
  dates equal a preset exactly.
- `WorkQueue` (server): the three-column strip from 1, fed by
  `loadDashboard().workQueue`. Counts keep their text labels; colour is never
  the only signal (G2).
- `KpiTile` + `useCountUp` (rAF, 900 ms ease-out cubic). **The animation must
  never be the initial render state**: the tile renders its final value on
  first paint and the count-up, if it runs at all, only animates from that
  point — a static export or a screenshot at t=0 must show the real figure,
  never "RM 0.00". Under `prefers-reduced-motion` the animation is skipped
  entirely. It runs once per mounted value and **must not restart when a
  filter, range, aggregation, trend switch or disclosure toggle changes**.
- `TrendCard`: the segmented control from 3 plus whichever chart is selected.
- `SalesLineChart` (Recharts `LineChart` + `Area` fill 6%, `ReferenceLine`
  dashed `brand-link` for average with a right label, custom `dot` renderer
  that draws the `primary` max/min points and their chips via `LabelList`
  or a custom SVG layer; tooltip "18 Aug — RM 47,950.00"). Colours via CSS
  variables read with `getComputedStyle` once, never hex literals.
- `StackedStageChart` (Recharts `BarChart` with six `Bar`s `stackId="a"`
  in reverse stage order so Delivered is at the bottom; `radius` only on the
  top segment via a custom `shape`; gaps via `barCategoryGap`).
- `StatusBar` (14px stacked bar + legend), used twice, in section 4.
- `MoreAnalytics` (client disclosure) wrapping `DonutShare` ×2
  (CSS `conic-gradient`, 168px, 26px ring, legend right), `InRangeGrid`,
  `ChurnList` and `PriceDriftList` (with the diverging bar).
- The "Purchase orders in range" table reuses Phase 05's `DataTable` with
  `from/to` fixed and "View all →" linking to `/purchase-orders?from=&to=`.
- The page header carries the "Upload PO" primary button — the only route to
  `/upload` (G1). Section eyebrows stay mono and tertiary but are not
  uppercased (G3).
- Empty state (no POs at all) per design reference §3.2, the only
  `gradient` button in the app.

The page is a server component that renders `loading.tsx` skeletons for each
card while `loadDashboard` runs; the charts are client components receiving
serialised data.

## 3. Performance

Target under 600 ms server time for Last year at daily aggregation on the
seed. Use `select` projections, fetch line items only for the share and
drift cards, and one query per concern rather than N+1. Add
`@@index([poDate])` usage checks with `EXPLAIN` if it is slower.

## 4. Tests

Vitest for every file in `src/lib/analytics/` with hand-computed fixtures:
bucket edges across month ends and the KL offset; min excluding empty
buckets; churn classes; drift sorting; previous-period arithmetic; share
folding into Other.

## 5. Acceptance criteria

1. The page renders in this order: work queue, three KPI tiles, one trend
   card, the two status bars, the collapsed "More analytics" disclosure, the
   in-range table. No "Awaiting review" KPI tile exists, and no donut is
   visible before the disclosure is opened.
2. The work queue counts do **not** change when the range chips or custom
   dates change, and its caption says it ignores the range; every other card
   does change. A zero column renders in `ink-disabled` and still shows its
   label and definition.
3. Changing a chip, a date or the aggregation redraws every range-driven card
   and updates the URL; a shared URL reproduces the view, including the trend
   selection and whether the disclosure is open.
4. Only one trend chart is on screen at a time; the segmented control swaps
   Fulfillment trend for Sales over time and the choice survives a reload.
5. The From/To inputs are not visible until "Custom range" is opened, and a
   URL that already carries `from`/`to` opens with them shown.
6. KPI figures match a manual SQL sum for the same range (write the query in
   the PR description).
7. KPI tiles show their final values on first paint — a screenshot or static
   export taken immediately after load never reads "RM 0.00" — and the
   count-up does not replay when a range, aggregation, trend or disclosure
   changes.
8. `prefers-reduced-motion` skips the count-up entirely (values still
   correct).
9. The line chart shows max/min chips, the dashed average with its label,
   and never skips empty buckets.
10. The stacked chart segments sum to the confirmed count per bucket; legend
    lists six stages in order; tooltip shows the split.
11. Opening "More analytics" reveals both donuts, In this range, churn and
    drift; their lists match the definitions and their empty states render.
12. Every status colour on the page — queue dots, badges, chart legends —
    uses the shared tokens: amber for needs review, red for failed, blue only
    for extracting (G2).
13. Empty database shows the gradient empty state.
