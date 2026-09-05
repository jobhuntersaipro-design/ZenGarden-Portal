# Phase 07 — Buyers

Branch `feature/buyers`. Depends on: 05 (tables) and 06 (analytics library,
charts). Screens: design reference §3.8 and §3.9.

Goal: a roster that answers "which customers need me today" and a per-buyer
page with trend, product mix, reorder signals and their POs.

## 1. Analytics additions — `src/lib/analytics/`

| File | Exports | Definition |
|---|---|---|
| `reorder.ts` | `reorderSignals(buyerHistory)` | per product bought ≥ 4 times: mean interval, due = last + interval; badge Overdue (>7 d past, `accent-red`), Due now (±7 d, `brand-amber`), Due (date, neutral); top 5 most pressing; also `overdueCount` for the roster |
| `buyer-status.ts` | `buyerStatus(buyer, current, previous, history, range)` | Lapsed / At risk / New / Active per §3.8, with the "record starts ≥ ¼ range before" guard for New |
| `product-mix.ts` | `productMix(rows, measure)` | share by value or quantity, top 5 + Other |
| `product-trend.ts` | `unitsPerBucket(rows, productIds, agg)` | units per bucket per product |
| `sparkline.ts` | `monthlyTotals(rows, range)` | 12-ish points for the roster sparkline |

`src/lib/queries/buyers.ts`: `listBuyers(range, filter, q, sort, page)`
computes status, cadence, overdue count and sparkline per buyer. Cadence and
reorder use full history, so this query loads every buyer's PO dates once
(ids, dates, totals only) and each buyer's line items grouped by product;
on the seed that is ~400 POs, fine in one round trip each. Sort happens in
memory after computing derived columns, then paginate.

## 2. Buyers roster — `/buyers`

Per §3.8: range chips (`?range=3m|6m|1y|all`), KPI row, `AttentionStrip`,
`BuyersTable` on `DataTable` with a `Sparkline` cell (60×24 inline SVG,
2px `ink`, `ink-disabled` when lapsed). Row → `/buyers/[id]`. The page header
carries the "Upload PO" primary button (G1).

**Overdue is red, never blue.** The "Overdue reorders" column of the attention
strip and the table's **Overdue** column both render any count of 1 or more in
`accent-red`; zero renders as an em dash in neutral `ink-tertiary`. There is
no amber "approaching" tier here — the number only counts items already past
their interval, so there is nothing to warn about in advance. (Amber stays for
"Due now" inside the Reorder signals card on buyer detail, where a future date
genuinely exists.)

**"New" is a neutral badge**, not blue: a new buyer is a standing state, not a
process in flight. Status badges use the shared tokens (G2) — Active
`accent-green`, At risk `brand-amber`, Lapsed/Churned `accent-red`, New
neutral `ink-secondary` — and every one keeps its text label.

**The attention counts and the table filter are one control.** Clicking a
column writes `?filter=lapsed|at-risk|overdue` **and** puts that column into a
visible selected state (ring plus tinted surface), so it is obvious the number
above and the rows below are the same thing. The result summary names the
active filter — "3 buyers · at risk" — and clicking the selected column again
clears both the filter and the selection. A column whose count is zero is
`ink-disabled` and not clickable (no pointer, not focusable).

## 3. Buyer detail — `/buyers/[id]`

Per §3.9. Server component loads the buyer, their POs in range and in the
previous period (with line items and products), and full history for
cadence and reorder signals.

- Controls: `RangeControls` variant with `?range=&agg=` (weekly to yearly).
- KPI row of five; "Last order" caption compares gap to 1.5× cadence.
- `SalesLineChart` reused for Order trend.
- `ProductTrendChart`: Recharts `LineChart` with one `Line` per selected
  product; `ProductPicker` (`Popover` with checkbox rows, max 6, default top
  3 by spend, selection kept in `?products=` so it survives range changes;
  colour assigned by rank at selection time and kept: store the assignment
  order in the URL param order).
- `WhatTheyBuy`: `DonutShare` + `HBarList` with the Value/Quantity segmented
  control (`?measure=value|qty`).
- `ReorderSignals` card: the five most pressing signals, Overdue rows in
  `accent-red` and Due now in `brand-amber`, plus a tertiary **"Upload PO"**
  action in the card with the caption "Opens the upload screen with this buyer
  preselected" — it links to `/upload?buyer=<id>` so the signal leads straight
  into the work.
- `Details` card: read-only here, with "Edit details" opening `EditBuyerSheet`
  (`updateBuyer` action: contact, email, phone, address, payment terms; name
  change allowed for super admins only and must stay unique). It renders only
  the contact values that exist. When the buyer has none, the card shows a
  **single empty state** — "No contact details yet" with an "Add contact
  details" action opening the same sheet — never a column of labelled rows
  with blank or em-dash values.
- `StatusBar` intake breakdown for this buyer's uploads in range.
- POs table: Phase 05 `DataTable` with `buyer` fixed and an *Items* column
  listing "12× Granite stepping stone, 3× …" ellipsised.
- The page header's "Upload PO" primary button also links to
  `/upload?buyer=<id>`; `/upload` has no sidebar entry (G1).

Buyer names everywhere (PO list, PO detail header, dashboard top buyer,
churn list) become links to `/buyers/[id]` in this phase.

## 4. Tests

Vitest with fixtures for `reorderSignals` (interval math, badge thresholds,
< 4 purchases excluded), `buyerStatus` (each class, the New guard),
`productMix` folding, `unitsPerBucket` with an empty bucket.

## 5. Acceptance criteria

1. Roster KPIs and the attention counts agree with the table statuses.
2. Clicking an attention column filters the table, shows a selected state on
   that column, and the summary reads e.g. "3 buyers · at risk"; clicking the
   selected column again clears both. A zero column cannot be clicked or
   focused.
3. Every roster column sorts, including Trend (by total) and Status (by severity).
4. Buyer detail range and aggregation drive every card except Reorder signals.
5. Product picker enforces the six-product cap with the amber caption and
   keeps colours stable on deselect.
6. Value/Quantity switch re-animates the donut and bars and swaps values.
7. Reorder signals on the seed show at least one Overdue and one Due now.
8. Editing buyer details persists and shows on PO detail.
9. Every overdue figure is red: the "Overdue reorders" attention count and
   every non-zero Overdue cell render in `accent-red`, zeros render as a
   neutral dash, and nothing overdue is blue anywhere on either screen.
10. A buyer with no status history shows a neutral "New" badge, not a blue one.
11. A buyer with no contact details shows one "No contact details yet" empty
    state with an "Add contact details" action — not a list of empty labelled
    rows; a buyer with details shows the real values.
12. The Reorder signals card offers "Upload PO" with the caption "Opens the
    upload screen with this buyer preselected", and it lands on
    `/upload?buyer=<id>` with the buyer preselected on the review screen.
13. Buyer and product names that ellipsise carry a `title` with the full value
    (G4); column headers are mono and not uppercased (G3).
