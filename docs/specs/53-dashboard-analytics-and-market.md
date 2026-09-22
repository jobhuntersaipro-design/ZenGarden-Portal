# Phase 53 — The dashboard reads by market, and trends by whatever you ask it

Asked for as: *"let's add more analytics in the dashboard page. and also add
market trend, by buyer etc. Also, make it filterable by market too."*

Status: **built and driven in a browser** (2026-09-22). §9 records the four
decisions as the user took them; §8 is now what was measured rather than what
was intended.

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

**Decided: (a), narrow the lines.** It is the same call the demand board
already made for its search, for the same reason, and it is the only one of
the three whose numbers add up. (b) would have been defensible if the team's
real question were "which orders involve Vietnam", and it is not.

### 2.2 Brand and category filter the same way

The user asked for brand and category beside market. All three are columns on
`Product`, so all three narrow the lines by exactly the rule above and
everything §2 says about market holds for them word for word — including that
a line with no matched product falls outside all three at once.

Two differences worth stating rather than discovering:

- **Category is non-nullable**, so it has no "No category" remainder of its
  own. Its only unattributed case is a line with no product.
- **They compose.** `?market=Mydin&brand=Zen+Garden` counts the lines that are
  both, and the summary line names both. Every figure still sums against the
  same denominator, because narrowing lines is closed under intersection.

The cost, accepted rather than hidden: **three filters is eight states each
figure must be right in**, against two for one filter. §8's criteria are
therefore written against the composition, not against market alone.

### 2.3 The market filter is not a stage filter

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
| ~~Delivery performance by market~~ | **Pulled into this phase at the user's request — see §4.4.** |

### 4.4 Delivery performance by market

Asked for despite §4.3's warning, and the warning is answerable rather than
fatal — but only by changing what is counted.

**On time is a property of the order, not of a line.** So this one figure does
*not* narrow to lines, and saying so is the whole design: for each market,
take the orders carrying at least one line in it, and report what share of the
**delivered** ones reached `DELIVERED` on or before their expected delivery
date.

**An order spanning two markets counts in both, and that is correct here.**
The order was late for Vietnam and late for Mydin; both markets were let down
by it. Counting it twice would inflate a *sum* — which is exactly what §2.1
rejects for money — but this is a **rate**, and a rate has no total to inflate.
The tile says "of orders touching this market" so the reader is never invited
to add the columns up.

**What it refuses to report:**

- An order with no expected delivery date has nothing to be late against, and
  is excluded from both the numerator and the denominator rather than counted
  as on time. The tile names how many were excluded.
- An order not yet delivered is not yet late *in this figure*, even if its date
  has passed — that is the demand board's Overdue column's job, and two screens
  disagreeing about what "late" means is worse than one screen not saying.
- A market whose delivered orders in range number zero prints `—`, not 0%.

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

## 8. Acceptance criteria — as measured

Driven against a **local Postgres 16** seeded with the project's own seed (423
purchase orders, 1,683 line items, 12 products), with three markets written
onto the catalogue and two products deliberately left with none. This
container has no Neon endpoint, so `src/lib/prisma.ts` and `prisma/seed.ts`
were pointed at a local adapter for the drive and **restored afterwards**; the
cluster was stopped and deleted.

Each is a measurement, not an opinion.

1. **PASS — sales by market sums correctly, to the cent, against the
   database.** Over 24 Aug – 22 Sep, read off the rendered page and checked
   against SQL rather than against itself:

   | | page | database |
   |---|---|---|
   | Mydin | 284,164.69 | 284,164.69 |
   | Super Indo | 127,676.43 | 127,676.43 |
   | Vietnam | 298,116.24 | 298,116.24 |
   | **markets** | **709,957.36** | 709,957.36 |
   | + No market | 194,973.49 | 194,973.49 |
   | **total** | **904,930.85** | 904,930.85 |

   **A measurement trap worth not re-deriving:** the KPI tiles count up over
   ~2s, so a script that samples at 700ms reads a mid-animation figure. A
   first pass did exactly that and reported the markets summing 28,792.15
   short — a defect that was not there. Sample after 3s.
2. **PASS in part — unattributed is visible, and names both figures.** The
   market mix footer reads *"Shares are of RM 709,957.36 in line value that
   carries a market. A further RM 194,973.49 is in no market — RM 194,973.49
   on products carrying none, RM 0.00 on lines that matched no product."* The
   **no-product half was not exercised**: every one of the 1,683 seeded lines
   resolves to a product, so that figure was only ever read as zero.
3. **PASS — the filter narrows every figure.** `?market=Mydin` read
   **RM 284,164.69 across 30 purchase orders** (against RM 904,930.85 / 42
   unfiltered), the KPI relabelled **"Sales in this selection"**, its caption
   **"RM 9,472.16 average per order, of these lines"**, and the summary line
   **"24 Aug 2026 – 22 Sep 2026 · 30 purchase orders · Mydin only — every
   figure below counts only these lines."** The market donut and the market
   mix card were **absent**, and the table carried its full-value caption.
4. **PASS.** With Mydin chosen the select still offers **All markets · Mydin ·
   Super Indo · Vietnam · No market**.
5. **PASS.** `?market=*none` read **RM 194,973.49**, exactly the database's
   figure for lines on products carrying no market.
6. **PASS by unit test, not driven.** Writing the criterion is what caught
   that it was not built: the page passed `?market=` straight through, so a
   value nothing carried would have drawn an empty board with the select
   still showing it. `resolveFilter` now drops any market, brand or category
   the range does not hold, the query echoes the *resolved* filter back, and
   the selects and the purchase-order table both read that rather than the
   URL. Four tests cover it, one counterfactual watched failing
   (`expected { market: 'Atlantis' } to deeply equal {}`). **No browser
   drove it** — the local database was already torn down.
7. **PASS in part — all three subjects draw.** `trend=market` → *3 of 3
   markets* (Vietnam, Mydin, Super Indo); `trend=buyer` → *6 of 11 buyers*;
   `trend=product` → *6 of 12 products*. **The deselect-keeps-colour
   behaviour was not re-driven here** — it is the buyer page's own mechanism,
   carried over unchanged, and criterion 8 covers that the move did not alter
   it.
8. **PASS on the data, NOT VERIFIED on the screen.** All 1,375 pre-existing
   tests pass unchanged after the refactor, including the three that pin
   `seriesPerBucket`'s bucketing. The buyer page itself was **not reopened**,
   so the claim that its trend renders identically rests on the adapter
   passing the same strings and formatters, not on a before-and-after.
9. **PASS.** `?measure=sales` → sales card *"RM 904,930.85 across 30 days"*,
   trend *"Sales per period · pick up to 6 markets"*; `?measure=units` → trend
   *"Cartons per period · pick up to 6 markets"*.
10. **NOT VERIFIED by counting.** No query counter was attached. The code
    adds three columns to two existing selects and no new `prisma` call, which
    is structural rather than measured.
11. **PASS, after fixing two defects the drive found (§8.1).** 390/390 with
    the disclosure closed *and* open; 1440/1440 on the desktop, filtered and
    not. All three new selects measure **44px**. The only controls under 44px
    are the donuts' two "Other (n)" unfold buttons at 21px — the pre-existing
    class.
12. **Three counterfactuals watched failing**, then restored:
    - keeping matching orders whole instead of narrowing to lines — two tests
      red, including `expected 200 to be 100`, which is precisely the
      inflation §2.1 rejects: one order spanning two markets counted fully in
      both;
    - dropping unattributed lines from the denominator — `expected 150 to be
      200`;
    - comparing delivery dates in UTC rather than Kuala Lumpur — `expected
      100 to be +0`, a delivery at 17:00Z on the due date reading as on time
      when it is already the next day in KL.

    A fourth, added with `resolveFilter`: honouring a market nothing in
    range carries — `expected { market: 'Atlantis' } to deeply equal {}`.

    The one named in the original criterion that was **not** run is deriving
    the market picker from the filtered rows: it lives in the query layer
    rather than a pure module, and no harness reaches it.

### 8.1 Two defects the browser found that the build could not

Both pre-existing, both in cards the **More analytics** disclosure hides —
which is why the 2026-09-06 mobile sweep never saw them: it measured the
dashboard with the disclosure closed.

- **The page overflowed at 390 with the disclosure open, 563 against 390.**
  Churn, price drift and every donut sat 543px wide in a 350px grid track —
  a grid item's default `min-width: auto` refusing to shrink, the same defect
  Phase 25 fixed on `/admin/customers`. `min-w-0` on each card.
- **Then 411 against 390**, from the donut legend: at 390 the 168px ring left
  it ~108px, and each row's `shrink-0` money figure is ~90px, so the figure
  spilled past the card. The legend now takes `basis-full` below `sm` and
  goes back beside the ring above it.

A third defect was this phase's own, and only the screenshot showed it: with
three series over thirty daily buckets the **point labels collided across
series** (`RM 5,206` printed over `RM 5,183`). `useLabelStep` spaces labels
along one series and cannot see the others, so the trend card prints them
only when a single series is drawn and leaves the tooltip to answer the rest.

---

## 9. The decisions, as taken (2026-09-22)

All four were put to the user with the recommendation first, before any code
was written.

1. **The filter narrows the lines** (§2.1 option a), as recommended. Every
   figure counts only the matching lines; Average order and Largest PO are
   relabelled under a filter; the PO table keeps whole orders and says so.
2. **One trend card with a subject switch**, as recommended, rather than three
   cards down the page.
3. **All three filters — market, brand and category.** The recommendation was
   market alone; the user asked for all three, so §2.2 sets out how brand and
   category inherit the same rule and what the extra states cost.
4. **§4.1 and §4.2, plus delivery performance by market.** The recommendation
   was to leave delivery performance out; it is in, designed in §4.4 as a rate
   rather than a sum, which is what makes it answerable at all. Margin and
   stock turn stay out — the portal holds no cost, and `stockCartons` is null
   on every product.

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
