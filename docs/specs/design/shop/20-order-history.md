# Phase 20 — Order history and reordering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** *Your orders* shows a buyer what they spend, when, and on what — a date range with presets and an aggregation, four KPIs, a spend chart, the top five products — over an order table whose rows open to show their lines, with *Order these again* on every one and *Reorder your last order* in the menu.

**Architecture:** One narrow query loads every order in the range with its lines; a pure analytics module derives the KPIs, the buckets and the ranking; the range parser is the portal's own, generalised to take the shop's preset table. Reordering is one Server Action that adds lines through the cart's existing upsert. The chart is Recharts inside `ChartScroller`, as every portal chart is.

**Tech Stack:** As 17, plus `recharts@3`, `src/lib/analytics/buckets.ts`, `src/components/charts/*`, `KpiTile`.

**Spec:** this file, `00-overview.md`, the prototype's *Your orders* view (`Shop.dc.html`, `isOrders`) and the `design:` commit messages of 2026-09-10 for the range and label rules. Read `src/lib/analytics/range.ts` and `src/components/dashboard/RangeControls.tsx` first.

**Branch:** `feature/shop-order-history`. Depends on 19 (the *View purchase order* link); independent of 21 and 22.

## Global constraints

- Phase 17's, unchanged.
- **A number and the table under it must agree** (master §4): the KPIs, the chart and the table read one query for one range.
- Weeks start Monday; every bucket boundary is Kuala Lumpur time; empty buckets are drawn.
- Client reads are narrow selects with no ops notes, names or pictures — asserted.
- Stage colours are the portal's six-hue palette (`stageColorVar`), never the prototype's own hex.
- Numbers render final: `KpiTile`'s server value is the first paint.

---

## 0. Why this exists

Phase 16 gave a client a paged list of references and totals. The customer drew what a buyer actually wants from their history: what they have spent with us over a period, how that spend moves, which products it goes on, and — the row that turns history into the next order — *Order these again*. The prototype's commit messages already settled the two behaviours that are decisions rather than details: a backwards custom range is swapped, and weekly labels run Monday to Sunday.

## 1. The range

`src/lib/analytics/range.ts` is generalised so the shop's presets are a second table over the same logic rather than a copy of it:

```ts
export type PresetTable<P extends string> = readonly { value: P; label: string; from: (today: TZDate) => Date }[];

export function createRangeParser<P extends string>(presets: PresetTable<P>, defaultPreset: P, defaultAgg: Aggregation) {
  return { presets, presetRange, parseRange, matchPreset };   // the four functions that exist today, closed over the table
}

// The portal's instance keeps every existing export name and behaviour:
export const RANGE_PRESETS = …; export const presetRange = …; export const parseRange = …; export const matchPreset = …;
```

```ts
// src/lib/analytics/shop-range.ts
export type ShopRangePreset = "today" | "7d" | "30d" | "3m" | "6m" | "1y";
export const SHOP_RANGE_PRESETS: PresetTable<ShopRangePreset> = [
  { value: "today", label: "Today",         from: (t) => startOfDay(t) },
  { value: "7d",    label: "Last 7 days",   from: (t) => startOfDay(subDays(t, 6)) },
  { value: "30d",   label: "Last 30 days",  from: (t) => startOfDay(subDays(t, 29)) },
  { value: "3m",    label: "Last 3 months", from: (t) => startOfDay(subMonths(t, 3)) },
  { value: "6m",    label: "Last 6 months", from: (t) => startOfDay(subMonths(t, 6)) },
  { value: "1y",    label: "Last year",     from: (t) => startOfDay(subYears(t, 1)) },
];
/** Default Last 3 months, monthly — three months buckets to four bars that keep their labels. */
export const { parseRange: parseShopRange, matchPreset: matchShopPreset } = createRangeParser(SHOP_RANGE_PRESETS, "3m", "month");
```

`?preset=`, `?from=`, `?to=`, `?agg=` on `/orders`, exactly the portal's vocabulary. A backwards custom range swaps; `to` clamps to today.

## 2. The data

```ts
// src/lib/queries/client-history.ts
export type ClientHistoryLine = {
  productId: string | null;
  name: string;                  // Product.name, or the printed description when unlinked
  sub: string;                   // "ZEN GARDEN · Goat's Milk · 6 per carton"
  code: string;                  // LineItem.sku ?? Product.sku (Phase 22: the buyer's alias)
  cartons: number;
  unitPrice: string;
  amount: string;
  pieces: number | null;
  inShop: boolean;               // SHOP_VISIBLE now — whether "Order these again" can add it
};
export type ClientHistoryOrder = {
  id: string;                    // WebOrder id while submitted; PurchaseOrder id once confirmed
  kind: "confirmed" | "submitted";
  reference: string;             // poNumber, or the W- reference
  buyerReference: string | null;
  placedAt: Date;                // poDate, or submittedAt
  stage: PoStage | null;
  documentId: string | null;     // for View purchase order
  cartons: number;
  pieces: number | null;
  total: string;
  lines: ClientHistoryLine[];
};
/** Every order in the range, newest first. A buyer's history is hundreds of rows; the page slices it. */
export async function listClientHistory(buyerId: string, range: { from: Date; to: Date }): Promise<ClientHistoryOrder[]>;
```

Confirmed: `purchaseOrder` where `buyerId`, `supersededBy: null`, `poDate` within `dateColumnRange(range)`; select `id, poNumber, buyerReference, poDate, stage, total, documentId, lineItems { sku, description, quantity, unitPrice, amount, product { id, name, sku, brand, variant, packSize, active, needsReview, listPrice } }`. Submitted: `webOrder` where `buyerId`, `status: SUBMITTED`, `submittedAt` in range; select `id, reference, buyerReference, submittedAt, subtotal, documentId, lines { cartons, unitPrice, amount, product {…} }`. Declined orders are not history. Nothing else is selected, and the test asserts the two `select` objects by equality.

## 3. The analytics — pure, tested

```ts
// src/lib/analytics/client-history.ts
export type HistoryKpis = { spent: number; orders: number; open: number; cartons: number; products: number; average: number | null };
export function historyKpis(orders: ClientHistoryOrder[]): HistoryKpis;                      // open = stage !== DELIVERED (a submitted order is open)
export type SpendBucket = { key: string; label: string; total: number };
export function spendByBucket(orders, from: Date, to: Date, agg: Aggregation): SpendBucket[];  // makeBuckets + bucketKey(placedAt); empty buckets kept
export type TopProduct = { productId: string | null; name: string; spend: number; cartons: number; share: number };  // share of the largest, 0–1
export function topProducts(orders, n = 5): TopProduct[];                                      // grouped by productId, unlinked lines by name
```

Money in these is `number` for charting, computed from the `string` amounts once at the boundary — the same trade `salesSeries` makes.

## 4. The screen — `/orders`

`requireClient()`; `range = parseShopRange(params)`; `orders = listClientHistory(buyerId, range)`; `filter = "all" | "open" | "delivered"` from `?filter=`; `page` from `?page=`.

- `h1` **Your orders**, caption `"{n} orders · open one to see the products it carried"` (`n` = the filtered count).
- **Range card** (`rounded-lg border-hairline p-md`): row one — caption *Showing* and the six preset chips (`ChoiceButton look="chip"`, which already exists; selected reads `bg-ink text-canvas border-ink font-semibold` per the canvas — adjust the look's `on` class if it does not); row two under a rule — *From* and *To* `<input type="date">` (36px, `rounded-sm`), and *Aggregate by* as a `Select` over `AGGREGATIONS`. All writes through `useUrlNavigation`, pending state through `usePendingChoice` as `RangeControls` does; a preset click clears `from`/`to`, a date edit sets `preset=custom` semantics by writing both dates.
- **KPI row** — four `KpiTile compact`: *Spent with us* (`formatMYR`, caption = the range label "10 Jun 2026 – 10 Sep 2026", or one date when equal), *Orders placed* (caption "{open} still in progress" or "All delivered"), *Cartons ordered* (caption "Across {products} products"), *Average order* (`—` with caption "Your typical basket" when none). 2-up below `md`, `mobileFull` on the money tile.
- **Two cards** side by side from `lg`:
  - *What you spend, by {agg noun}* · caption `"{range} · MYR"` · `ShopSpendChart` (client): Recharts `BarChart` in `ChartScroller` (floor from the longest label, as the portal's), bars `cssVar(SHARE_VARS[0])`, whole-figure value labels via `valueLabel`/`labelledIndices` hidden past 12 buckets, ticks every `axisInterval(n)`, `CHART_ANIMATION`; "No orders in this range. Try a wider one." when the range has none.
  - *What you buy most* · caption "Top five by spend · {range} · MYR" · `TopProductsList`: per row the name (a link to the product when `inShop`), the spend right-aligned, a 12px bar `bg-surface` track with a `bg-focus`… a purple **bar** is a chart mark and is allowed; use the same `cssVar(SHARE_VARS[0])` inline style the donut uses — width `share × 100%`, and `"{cartons} cartons"` in a fixed 84px caption column.
- **Filter chips**: *All orders* · *In progress* · *Delivered* (`?filter=`).
- **The table** (`OrderHistoryTable`, client): `rounded-lg border-hairline overflow-hidden`; header `bg-surface` (Order · Your PO number · Placed · Cartons · Total · Stage); each row a `<button aria-expanded>` on `grid-cols-[170px_1fr_110px_90px_120px_150px_32px]` from `lg` (card below): mono reference, buyer reference (`—` in `ink-disabled`), date, cartons, total `body-md font-semibold`, stage dot + label (*With the team* when null), a chevron that rotates when open; the open panel `bg-surface px-md pb-md` holds a white `rounded-md` lines table (Product + sub · Code mono · Cartons · Per carton · Amount) and a footer strip: `"{cartons} cartons · {pieces} pieces in this order"`, **View purchase order** outlined (`<a target="_blank">` to `/purchase-orders/{id}`, only when `documentId`), **Order these again** ink pill (`h-control-sm`). One row open at a time; the open row's id lives in component state, not the URL.
- `TablePagination` at 20 over the filtered rows; the analytics above ignore both filter and page (they describe the range).
- **Mobile**: KPIs 2-up, cards stacked, the chart scrolls inside its card, rows as cards with the same open panel.

## 5. Reordering

```ts
// src/actions/reorder.ts   "use server"
export type ReorderResult = { added: number; skipped: string[] };   // skipped: product names no longer in the shop
/** Adds every line of one of the buyer's own past orders to the caller's cart, through the same upsert addToCart uses. */
export async function reorderOrder(input: { kind: "confirmed" | "submitted"; id: string }): Promise<ActionResult<ReorderResult>>;
/** The buyer's most recent order by placedAt, then the same. */
export async function reorderLast(): Promise<ActionResult<ReorderResult>>;
```

`requireClient()`; the order is loaded `where { id, buyerId }` (a guessed id is "That order is gone"); lines with a `productId` whose product is orderable are upserted with `increment`; lines without a product or no longer in the shop are skipped and named. The client component toasts `"{added} lines added to your cart"` and, when skipped, `"— {n} no longer available: {names}"`, then `router.push(shopHref.cart())`. The cart page's summary shows the merged quantities.

The account menu gains the boxed **Reorder your last order** lead (`border-hairline rounded-sm`, the refresh icon and label in `text-focus font-semibold` — purple as text) and **Delivery updates** → `/orders?filter=open` with the chevron. `/orders/[id]` stays as the tracking page the receipt and the sent page link to; restyle its header to match, nothing more.

---

## 6. Tasks

### Task 1: The range parser, generalised

**Files:** `src/lib/analytics/range.ts`, `src/lib/analytics/range.test.ts` (existing — must pass unchanged), `src/lib/analytics/shop-range.ts`, `src/lib/analytics/shop-range.test.ts`

- [ ] Failing tests (`shop-range.test.ts`, `now = 2026-09-10T06:00:00Z`):

```ts
it("defaults to Last 3 months, monthly", () => { const r = parseShopRange({}, now); expect(r.preset).toBe("3m"); expect(r.agg).toBe("month"); expect(kl(r.from)).toBe("2026-06-10"); expect(kl(r.to)).toBe("2026-09-10"); });
it("Today is one KL day", () => { const r = parseShopRange({ preset: "today" }, now); expect(kl(r.from)).toBe("2026-09-10"); expect(kl(r.to)).toBe("2026-09-10"); });
it("swaps a backwards custom range and clamps to today", () => { const r = parseShopRange({ from: "2026-12-01", to: "2026-08-01" }, now); expect(kl(r.from)).toBe("2026-08-01"); expect(kl(r.to)).toBe("2026-09-10"); expect(r.preset).toBeNull(); });
```

- [ ] FAIL → implement §1; run `range.test.ts` too → both PASS. Commit `refactor(analytics): one range parser, two preset tables`

### Task 2: History data and analytics

**Files:** `src/lib/queries/client-history.ts`, `src/lib/queries/client-history.test.ts`, `src/lib/analytics/client-history.ts`, `src/lib/analytics/client-history.test.ts`

- [ ] Failing tests — analytics: `historyKpis` over three orders (two delivered, one submitted) → `orders 3, open 1, cartons 13, products 5, average = spent / 3`; empty → `average null`; `spendByBucket` over a three-month monthly range with orders in two of them → three buckets, the empty one at 0, labels `Jul 2026 · Aug 2026 · Sep 2026`; weekly labels `31 Aug–6 Sep` across the month; `topProducts` ranks by spend, `share` 1 for the top, unlinked lines grouped by name. Query: the two `select`s asserted by equality; `inShop` false for a `needsReview` product; declined orders absent.
- [ ] FAIL → implement §2, §3 → PASS. Commit `feat(shop): the buyer's history — one query, pure analytics`

### Task 3: The screen

**Files:** `src/app/(storefront)/shop/orders/page.tsx` (rewrite), `loading.tsx`, `src/components/shop/orders/HistoryRangeCard.tsx`, `HistoryKpis.tsx`, `ShopSpendChart.tsx`, `TopProductsList.tsx`, `OrderHistoryTable.tsx`, `src/components/portal/ChoiceButton.tsx` (the `chip` look's selected style, if it differs from the canvas)

- [ ] Build §4. `ShopSpendChart` copies the label plumbing from `SalesLineChart` (`useLabelStep`, `labelledIndices`, `valueLabel`, `axisInterval`) rather than inventing its own.
- [ ] Browser as a client with history (seed: confirm three shop orders on different days, or use a buyer the seed already gave orders — the client can be re-pointed at a seeded buyer for the test and pointed back): the four KPIs equal `SELECT count(*), sum(total) … WHERE "buyerId" = … AND "poDate" BETWEEN …` for the same range; the chart's bar values sum to the *Spent with us* tile; switching to weekly over Last year draws the axis with every `ceil(n/12)`th tick and scrolls inside the card; a backwards custom range swaps in the URL; opening a row shows its lines with amounts summing to the row total. Record each pair of figures. Zero overflow at 390 with the chart scrolling and the rows as cards.
- [ ] Commit `feat(shop): Your orders — range, KPIs, spend chart, top products, expandable rows`

### Task 4: Reordering

**Files:** `src/actions/reorder.ts`, `src/actions/reorder.test.ts`, `src/components/shop/orders/ReorderButton.tsx`, `src/components/shop/ShopAccountMenu.tsx`, `src/app/(storefront)/shop/orders/[id]/page.tsx` (header restyle)

- [ ] Failing tests: `reorderOrder` upserts each linked, orderable line with `increment`; skips and names an unavailable one; refuses another buyer's id; `reorderLast` picks the newest by `placedAt` across both kinds; a guest is refused.
- [ ] FAIL → implement §5 → PASS.
- [ ] Browser: with an empty cart, *Order these again* on a three-line order → toast "3 lines added", `/cart` shows the three with the order's cartons; again on the same order → cartons doubled (one row each — `SELECT count(*)` on the DRAFT's lines stays 3); mark one product `needsReview` and reorder → toast names it, 2 added. *Reorder your last order* from the menu adds the newest order.
- [ ] Commit `feat(shop): order these again, and reorder your last order`

### Task 5: Verification, cleanup, history

- [ ] Suite, types, lint, build; sweep `/orders` (five preset × aggregation pairs) and `/orders/[id]` × {390, 768, 1440}.
- [ ] Remove test data: any orders created, the DRAFT, `needsReview` restored, the client re-pointed; counts before/after.
- [ ] `context/current-feature.md` entry.

## 7. Acceptance criteria

1. The KPIs, the chart and the table describe the same orders for the same range — cross-checked against raw SQL for one preset and one custom range.
2. Empty buckets are drawn; weekly labels run Monday–Sunday; the axis thins to every `ceil(n/12)`th tick; the plot scrolls inside its card past fourteen buckets.
3. A backwards custom range is swapped, not empty; `to` never passes today.
4. Opening a row shows its lines, their codes, and amounts that sum to the row's total; *View purchase order* opens the Phase 19 viewer in a new tab.
5. *Order these again* adds every still-available line to the cart, increments on repeat, and names what it could not add.
6. No ops remark, stage note, name or picture appears in the page HTML.
7. Zero horizontal overflow at 390, 768 and 1440.

## 8. Out of scope

- **Exporting history** (CSV) — nobody asked.
- **A per-product history page on the shop** — the product link goes to the catalogue page.
- **Emailing stage changes** — still six emails an order nobody wants.
