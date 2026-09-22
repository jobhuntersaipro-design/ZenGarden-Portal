# Phase 53 — The dashboard reads by market, and trends by whatever you ask it

Asked for as: *"let's add more analytics in the dashboard page. and also add
market trend, by buyer etc. Also, make it filterable by market too."*

Status: **spec only, nothing built.** §2 and §9 carry the decisions that need
answering before anyone writes code.

---

## 1. What the dashboard is today, and what it cannot answer

`/` loads once through `loadDashboard(range, agg)` and draws, in order:

1. **Work queue** — outside the range, because a draft has no PO date.
2. **Range controls** — five presets, a custom from/to, five aggregations.
3. **Three KPI tiles** — Total sales (with a vs-previous delta), Purchase
   orders, Top buyer.
4. **Sales over time**, with a Sales · Quantity measure switch.
5. **Order stage**, with the six-stage status bar as its legend.
6. **More analytics**, behind a disclosure: two donuts (share by buyer, share
   by product), the six-tile In-range grid, churn, price drift.
7. **The purchase orders in range**, as a table.

Every figure on it comes from one fetch of the range's orders, and that is the
property this phase must not break: two numbers describing the same thing
cannot be allowed to disagree.

**What it cannot answer, and the reason each is impossible today:**

| Question | Why not |
|---|---|
| How is Vietnam doing against Mydin? | No figure on the page knows what a market is. |
| Is Super Indo growing or shrinking? | No trend is drawn per market. |
| Which buyers are growing? | Share by buyer is one snapshot of the range — a pie, not a line. Growth is invisible. |
| Show me only Mydin's numbers | There is no filter on the dashboard at all beyond the date range. |
| Which products are growing? | Same as buyers: a donut, no trend. |

The buyer detail page already draws a **multi-series trend with a picker**
(`src/components/buyers/ProductTrend.tsx`) — up to six products, colour pinned
to the product rather than to its rank, freed slots reused so a deselect never
repaints its neighbours. That component is the answer to three of those five
rows, and this phase generalises it rather than writing a second one.

---

## 2. The decision everything else rests on: a purchase order is not in a market

**A market is a column on `Product`, not on `PurchaseOrder`.** One purchase
order can carry Vietnam lines and Mydin lines. So:

- **Sales by market must be summed from line-item amounts, never from order
  totals.** An order's `total` cannot be attributed to one market without
  lying about it.
- `Σ(markets) ≤ total sales`, and the gap is real. Two things fall outside
  every market:
  - a line with **no matched product** (`productId` null — the reviewer chose
    "Not a product", or a scan whose code matched nothing);
  - a line whose product carries **no market** (the remainder row the catalog's
    Markets view already names "No market").
- **Line amounts need not sum to the order total either.** A purchase order
  carries tax and its own stated total; `checkTotals` allows a confirmed order
  whose figures were acknowledged as mismatched.

**None of that may be hidden.** Whenever the dashboard shows money by market it
also shows what it could not attribute, in words, or the reader will read the
market columns as the whole business.

### 2.1 What the market filter narrows — the decision

Three readings, and they produce different numbers from the same data:

**(a) Narrow the lines. Every figure counts only that market's lines.**
Total sales becomes that market's revenue; units become its units; the donuts,
the trends and the in-range tiles all follow. Purchase orders counts the orders
that carry at least one line in the market. The summary line says so, in the
demand board's own words: *"every figure below counts only what matches."*

- Honest by construction: the figures cannot claim more than the market earned.
- The cost, stated: **Average order and Largest PO change meaning.** They
  become "average of this market's share of each order" and "the order with the
  most Vietnam in it" — which is the right answer to a market question and the
  wrong answer to "what is our biggest order". The tiles must be relabelled
  under a filter, not merely refiltered.
- The PO table under the page lists whole orders, so its rows' totals will
  exceed the sales figure above them. The table needs a caption saying it lists
  the orders that touch the market, at their full value.

**(b) Narrow the orders. Keep any order that touches the market, count it whole.**
Every existing tile keeps its meaning and the table reconciles exactly. But an
order with one Vietnam line among ten counts entirely as Vietnam, so the market
totals are inflated and — worse — *the markets sum to more than the business*.

**(c) Two figures everywhere.** Doubles every tile. Rejected on sight.

**Recommendation: (a).** It is the same call the demand board already made for
its search, for the same reason, and it is the only one of the three whose
numbers add up. §9 asks the user to confirm it, because (b) is defensible if
the team's real question is "which orders involve Vietnam".

### 2.2 The market filter is not a stage filter

`?market=` on the dashboard reuses the catalog's vocabulary exactly:
`src/lib/product-markets.ts` already exports `NO_MARKET` (`"*none"`) and
`NO_MARKET_LABEL`. The dashboard's select offers **All markets**, each market
in use, and **No market** — the same list, the same sentinel, so a link copied
between the two pages means the same thing. A market that is not in the
catalogue's vocabulary falls back to All rather than drawing an empty board,
the way a bad `?until=` already falls back on the demand board.

---

## 3. Trend by whatever you ask it

One card, not three. **"Trend by Market · Buyer · Product"** — a subject switch
(`?trend=market|buyer|product`, default `market`), then up to six series picked
from that subject's own ranked list, over the page's existing buckets and
aggregation.

Why one card rather than a Market trend card plus a Buyer trend card plus a
Product trend card:

- The three answer the same question at three grains, and stacking three
  near-identical charts down the page is how a dashboard becomes unreadable.
- Colour, slot behaviour, the picker, the axis, the labels and the empty state
  are written once. Three cards means three chances for them to drift.
- The subject switch is the same `SegmentGroup` the measure switch already uses
  one card above it.

**Measure follows the card above it.** The sales card already has Sales ·
Quantity; the trend card reads the same `?measure=`, so the page never shows
money in one chart and cartons in another without saying which. (Recorded as a
deliberate coupling: changing the measure changes both.)

**Shape: multi-series lines, not a stacked area.** A stack answers "what is the
total made of" — which the donuts already answer for this range — and it hides
the one thing a trend is read for: whether *this* market is going up. Lines
share a zero baseline and can be compared directly.

**Reuse, concretely.** `src/lib/analytics/product-trend.ts`'s `unitsPerBucket`
is `ProductTrend`'s data source and is already generic in everything but its
name and its hardcoded `line.quantity`. It becomes
`seriesPerBucket(orders, keyFn, valueFn, ids, from, to, agg)` in a renamed
`src/lib/analytics/trend.ts`, with the existing call site passing the product
key and the quantity value. The component moves to
`src/components/charts/SeriesTrend.tsx` and the buyer page imports it from
there. **This is a refactor of working code and must not change what the buyer
page draws** — §8 pins that.

**The series list is ranked, and the pickers read the unfiltered pass.** Top six
by the current measure are selected by default; the picker offers every
subject in the range, ranked. Under a market filter the buyer and product
pickers offer that market's buyers and products — that is the filter doing its
job — but the *market* picker always offers every market, so narrowing to
Vietnam never removes Mydin from the control that would take you back. (The
demand board's rule, and the same reasoning.)

---

## 4. The analytics to add, and what each costs

Split by what it costs to compute, because "more analytics" is only worth
having if the page stays one fetch.

### 4.1 Free — already in the payload, nobody is reading it

| Figure | Where | Note |
|---|---|---|
| **Share by market** (donut) | More analytics, first of the row | The third donut beside buyer and product. Needs `market` on the line's product — one column on an existing select. |
| **Markets sold into** (tile) | In-range grid | Count of distinct markets with sales in the range. |
| **Unattributed sales** (tile) | In-range grid | The money §2 says cannot be put in a market, as a figure and a percentage. Renders only when it is not zero — a zero is nothing to report. |
| **Units per order** | In-range grid | `totalUnits / orderCount`, both already computed. |
| **Repeat rate** | In-range grid | Buyers in range with ≥2 orders, over buyers in range. `orders` is in hand. |

### 4.2 Cheap — one more column or one more grouped count

| Figure | Cost |
|---|---|
| **Market trend** (the §3 card) | `market` on the line's product. Same fetch. |
| **Buyer trend / product trend** (same card) | Nothing new. |
| **Market mix vs. previous period** — each market's share now against the prior range, so a market that is losing ground shows it | The prior period's orders are already fetched for the delta, but **without line items on the prior fetch** — the prior select omits `product.market`. One column added to a select that already loads line items. Free. |
| **Top buyer per market** | Derived from the same lines. |

### 4.3 Not free — and therefore not in this phase

| Figure | Why it is out |
|---|---|
| Margin, cost, profit by market | The portal stores no cost. Nothing to compute from. |
| Forecast / projection | Needs a model nobody has agreed, and a wrong forecast on a dashboard is worse than none. |
| Stock turn by market | `Product.stockCartons` is null on every product; the demand board already refuses to draw a figure it does not have, and so should this. |
| Delivery performance by market (promised vs. actual) | Reachable — `PoStageEvent` carries the moves — but it is an order-level fact being asked at a line-level grain, which is §2's whole problem again. Worth its own phase. |

---

## 5. The page, after

```
Work queue                                    (unchanged, outside the range)
Range controls  ── presets · custom · aggregation · [All markets ▾]   ← new
Summary line    ── "1 Aug – 30 Sep · 38 purchase orders"
                   + under a filter: "· Mydin only — every figure below
                     counts only this market's lines."                 ← new
KPI tiles       ── Total sales · Purchase orders · Top buyer
                   (relabelled under a filter, per §2.1)
Sales over time ── Sales · Quantity                      (unchanged)
Trend by        ── Market · Buyer · Product, up to 6 series            ← new
Order stage     ── + status bar                          (unchanged)
More analytics  ── Share by market ← new · by buyer · by product
                   In-range grid (+4 tiles, §4.1)
                   Market mix vs. previous period        ← new
                   Churn · Price drift                   (unchanged)
Purchase orders in range (table)  + caption under a filter, per §2.1
```

**The market select sits with the range controls**, not in the More analytics
disclosure, because it changes every figure on the page and a control that does
that must not be hidden behind one.

**Nothing new is added above the fold.** The trend card is the one new thing in
the always-visible part of the page; everything else in §4.1 lands inside the
disclosure, which is what it is for.

---

## 6. URL, and what resets what

| Param | Values | Default |
|---|---|---|
| `market` | a market name, `*none`, or absent | absent = all markets |
| `trend` | `market` \| `buyer` \| `product` | `market` |
| `series` | comma-separated ids, blanks preserved as freed colour slots | top six by measure |

- Changing `market` **clears `series`**, because a buyer or product id selected
  under one market may not exist under another, and a picker that shows a
  series the chart cannot draw is the defect this project keeps fixing.
- Changing `trend` clears `series` for the same reason.
- Changing the range does **not** clear `series` — the same buyer over a longer
  window is exactly the question being asked.
- Changing `market` does not reset the range, the aggregation or the measure.
- `page` resets on every one of them, as it already does.

---

## 7. What this does to the rest of the app

- **`src/lib/queries/dashboard.ts`** grows `market` on both line-item selects
  and a `market` argument. One fetch still.
- **`src/lib/analytics/product-trend.ts`** → `trend.ts`, generalised (§3).
  `ProductTrend.tsx` → `src/components/charts/SeriesTrend.tsx`.
- **`src/lib/product-markets.ts`** is imported by the dashboard for `NO_MARKET`
  and `NO_MARKET_LABEL`. It is pure and has no Prisma import, so this is safe
  from a client component — the boundary break that caught Phase 51's
  `DEMAND_SPAN` does not apply.
- **Nothing on the shop changes.** No shop query is touched.
- **No migration.** Every column already exists.
- **No new dependency.** Recharts draws it.

---

## 8. Acceptance criteria

Each is a measurement, not an opinion.

1. **Sales by market sums correctly.** For a range, the market donut's slice
   values plus the unattributed figure equal the sum of all line amounts in the
   range, to the cent. Read both off the rendered page, not off a test.
2. **Unattributed is visible when it exists.** With at least one line carrying
   no product and one product carrying no market, the tile renders and names
   both figures; with neither, it is absent rather than showing zero.
3. **The market filter narrows every figure on the page.** With `?market=X`:
   the KPI total equals that market's slice from criterion 1; the summary line
   says it is filtered; the trend card, both other donuts and the in-range
   tiles all move. Screenshot before and after, cropped.
4. **The filter is undoable from the control that set it.** With a market
   chosen, the select still offers every other market and All markets.
5. **`?market=*none`** shows exactly the sales of products carrying no market,
   and the select reads "No market" rather than falling back to All.
6. **A market that does not exist falls back to All**, with the select showing
   All markets — the picker never shows a filter the page is not applying.
7. **The trend card draws all three subjects**, six series each, with colour
   pinned per series: deselect the first of three and the other two do not
   change colour. (The existing slot behaviour, re-measured here.)
8. **The buyer page's product trend is unchanged by the refactor.** Same
   series, same colours, same labels, same picker, before and after — read off
   the rendered page, not argued from the diff.
9. **Measure is shared, and says so.** Switching Sales → Quantity moves the
   sales card and the trend card together.
10. **One fetch.** The dashboard's query count does not rise with the number of
    markets, subjects or series. Counted, not assumed.
11. **Phone.** No page overflow at 390; every new control clears 44px; the
    trend card scrolls inside `ChartScroller` like every other chart.
12. **Counterfactuals watched failing**, at minimum: attributing an order's
    whole total to the market of its first line (criterion 1 goes red);
    dropping unattributed lines silently instead of reporting them (criterion 2
    goes red); deriving the market picker from the filtered rows (criterion 4
    goes red).

---

## 9. Decisions I need from you before building

1. **§2.1 — what the market filter narrows.** Recommend (a), narrow the lines.
   (b) keeps every tile's meaning but lets the markets sum to more than the
   business.
2. **One trend card with a subject switch, or three separate cards?**
   Recommend one.
3. **Is "market" the right axis to filter the whole dashboard by**, or would
   you also want brand and category there? Recommend market alone for now —
   each extra filter multiplies the states every figure has to be correct in,
   and market is the one that was asked for.
4. **Anything in §4.3 you actually want**, knowing the cost. Delivery
   performance by market is the one I would build next.

## 10. Known, and out of scope

- **No production figures informed this spec.** No production database was
  read. How many markets exist there, how much revenue is unattributed, and
  whether six series is enough are all unknown — development's catalogue is
  seeded and its markets were written by hand for an earlier drive.
- **Six series is a palette limit, not a judgement.** `SHARE_VARS` holds six
  validated hues and the rule since Phase 06 is that a seventh folds into
  "Other" rather than cycling. A business with nine markets will not see three
  of them on the trend at once; the picker is how you reach them.
- **The prior-period comparison is one number per market**, not a second line
  on the chart. Two periods on one time axis needs an x-axis that means two
  things at once.
- **A market is still not on the order.** Nothing here adds one, and nothing
  should: the market belongs to the product, and an order that spans markets is
  a real thing the business does.
