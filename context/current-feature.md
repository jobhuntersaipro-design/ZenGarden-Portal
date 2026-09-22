# Current Feature: Order stage on the Demand Board, reading by product

## Status

**Built and driven in a browser on `main`** (2026-09-22). Asked for as: "Move
Order stage to Purchase Order Tab. I've also show u a screenshot of how it
looks like in Vercel, I like the design. Basically when user hover in the bar
chart, the table below will updated too. My idea is when user hover it, the
table below will show Per product, then how many order under each stage for
that hovered-selected bar by day."

**The chart left the dashboard rather than being copied**, and then moved
again the same day: first to the purchase-order page, then — asked for as
"Can you move the order stage to deman tab instead?" — to the Demand Board,
where it sits **below the committed board**. The master list is what that page
is opened for, and a chart above it would push thirty day columns under the
fold. The dashboard keeps the two cards that read by money — Sales over time
and the trend — and the purchase-order page is back to the review queue, the
filters and the table.

**The two boards on that page answer opposite questions and share nothing.**
The committed board looks *forward* from today, in cartons, over open orders,
narrowed by its own grain, span, search and filters; the stage board looks
*back* over the last 30/60/90 days, in orders, at every confirmed one, and
reads only its own `?stage_window=`. A search that narrowed both would be one
control narrowing two different populations over two different timelines.
**Driven:** `?q=Meridian` on the demand board reads *2 open orders · 288
cartons · 18 rows* before and after clicking the stage board's 90 days, the
search box still holding "Meridian", while the stage board goes from 42 to
**106 orders**. Its chips write the current path and keep every other
parameter, so the grain, span and search survive the click.

**It does not print.** `PrintBoard` scales the page to the *committed* table's
own width, so a second scroller would print cut off, and a stage chart is not
what somebody carries into a planning meeting. **Measured under print media:**
the stage board's wrapper computes `display: none` while the demand table
computes `table` and the heading stays `visible`.

**The table is the bar's own breakdown, and that is the whole design.** The
chart answers how many orders and at which stage; a reader looking at a tall
bar immediately asks what is in it, and a tooltip cannot answer that — it
holds six numbers about stages and nothing about products. Hovering a bar puts
that day's orders in the table below, one row per product with that product's
orders counted into the stage each one stands at. Moving off puts the whole
window back. The tooltip is **off** on this chart for the same reason: two
explanations of one bar, one of them following the pointer, is noise.

**An order counts once per product it carries, never once per line.** A
document printing the same product twice is still one order at one stage.
Across *different* products it does count more than once, deliberately — an
order carrying three products is genuinely in flight for all three — so the
stage columns total more orders than exist. **The caption says so** rather
than leaving a reader to add the column and find it disagrees with the bar.
Measured: 42 orders in the window, **148 order-product pairs** in the table.

**A tap pins, and tapping the same bar releases it**, because a phone has no
hover. A "Show the whole window" button appears while a bucket is pinned, so
there is always a way back that does not depend on a pointer.

**Three chips, no grain switch.** 30 / 60 / 90 days at daily grain, its own
`?stage_window=` that the list's filters do not touch. The board reads its own
window on purpose: the table under the chart is a breakdown *of the bars*, so
narrowing it by the search or a status chip would leave the chart and the
table disagreeing about which orders they count. A window the URL does not
name falls back to 30 rather than drawing nothing.

**The unmatched remainder is a row, pinned last.** Lines that matched no
product gather into one `*none` row, after the products whatever its count —
the catalogue's own "No market" rule. It is not a product, and leading the
board with it would bury the ones the reader came for.

## Verified, with the figures

**Driven in a real browser against a real database.** This container has no
Neon endpoint, so a local Postgres 16 was stood up, the project's own seed run
against it (423 purchase orders, 1,683 line items, 12 products), and
`src/lib/prisma.ts` and `prisma/seed.ts` pointed at a local adapter for the
drive and **restored afterwards**; the cluster was stopped and deleted, and
`package.json` and `package-lock.json` are untouched.

- **The stage counts reconcile to SQL, not to themselves.** Over the last 30
  days the legend read **Order placed 5 · In production 4 · QC passed 8 · In
  warehouse 4 · Delivering 5 · Delivered 16**, summing to the heading's **42
  orders** — every one of those six figures matching its SQL equivalent
  exactly.
- **The windows too:** 60 days read **77 orders**, 90 days **106**, against
  SQL's 77 and 106.
- **A hovered bar's breakdown reconciles.** 24 Aug drew **10 rows**, every
  figure in the Delivered column: `HAND SANITIZER 60ML — Fresh 3`, three
  products at 2 and six at 1. SQL grouped by product id returns exactly those
  ten rows; grouped by *name* it returns nine, because **two real products
  share the name `ZEN 2.1L — Goat's Milk`** — the catalogue duplicate already
  recorded on 2026-09-22. The board is right and the name-grouped query is
  the one that lies.
- **The whole-window table matches the same query:** ZEN D'LUX **19**,
  H/WASH Strawberry **16**, ZEN 1L Royal Jelly **16**, and the two Goat's Milk
  ids at **15** and **14** — SQL's 15 and 14, where by name they read 24.
- **Hover, leave, pin, release** all driven: hover → *24 Aug*, 10 rows; leave
  → *The last 30 days*, 12 rows; click then move the pointer away → still
  *24 Aug* with the release button present; release → back to the window.
- **A stale window is dropped, not honoured.** `?stage_window=9999` drew the
  30-day board with the **30 days** chip selected.
- **Neither the dashboard nor the purchase-order page carries it:** "Order
  stage" appears **0 times** on each, against 1 on the dashboard before. The
  purchase-order page's review queue and its 13 table rows are untouched.
- **Phone.** 390/390 with a bucket pinned and without, on `/demand` as it was
  on `/purchase-orders`. The table scrolls inside its own frame (**789px in a
  302px frame**) and the chart likewise (816 in 302), so neither pushes the
  page. **No control under 44px.** 1440/1440 on the desktop, and the stage
  board sits at y=1336 against the demand table's 395 — below it, measured.
- **Two counterfactuals watched failing**, then restored: counting per line
  rather than per distinct product (`expected 2 to be 1` — one order read as
  two); and letting the unmatched remainder sort with the rest
  (`expected [ '*none', 'p1' ] to deeply equal [ 'p1', '*none' ]`).
- **1448/1448 tests across 115 files** (9 new), `tsc`, lint (the same 2
  pre-existing `username` warnings) and `npm run build` clean.

### Three defects the drive found that the build could not

- **A value exported from a `"use client"` module is not that value on the
  server.** `STAGE_WINDOWS` lived in the board component, and the page's
  `STAGE_WINDOWS.includes(...)` threw *"is not a function"* on every request —
  with `tsc` and all 1,448 tests clean. It is the Phase 51 `DEMAND_SPAN`
  trap arriving from the opposite direction, and the constant now lives in
  `src/lib/po-stage-window.ts`, which imports nothing.
- **A tap could not pin the bar it landed on.** The click handler read
  Recharts' own `activeTooltipIndex`, which lags the mousemove before it — with
  a 60ms settle it worked, with none it failed at **390 and at 1440 alike**,
  and a real tap has no settle. A `useRef` written in the hover handler did
  **not** fix it (measured: still failing both widths), because Recharts had
  not dispatched the move at all. The click is on each `<Bar>` now, which
  carries its own datum and needs no hover to have happened.
- **Hovering moved the table and left the plot unchanged**, so nothing on
  screen said which bar was being read — the interaction's whole premise. The
  bars beside the active one now fade to 25%.

## Not verified

- **Anything on production**, and no production or development database was
  read or written. Every figure above is the project's own seed.
- **Keyboard.** A bar is not a button: the breakdown can be reached by hover
  or tap and by nothing else. The window chips and the product links tab
  normally; choosing a bucket does not.
- **A window wide enough to be unreadable.** 90 days draws 90 buckets and was
  driven; the chart scrolls, but nothing caps how narrow a bar gets.
- **A product whose breakdown is long.** The widest table was 12 rows, and it
  is unpaged by design — the window is the paging.
- **The `*none` row carrying a value.** All 1,683 seeded lines resolve to a
  product, so the remainder row was never drawn. It is covered by unit tests
  and has never been seen on screen — the same gap Phase 53 recorded for the
  `noProduct` half of its unattributed figure.
- **`StageCard` has no caller now.** It is left in the tree rather than
  deleted, per `context/ai-interaction.md`'s rule about deleting files, and
  `DashboardData` still computes `stages` and `stageBreakdown` from rows it
  already holds — no extra query, but nothing reads them.
- **`npm run build` without a stand-in for `xlsx`.** That package installs
  from cdn.sheetjs.com, which this container's network policy answers 403 to,
  which is why the 116th test file still fails here.

## Previous phase

**The dashboard reads by market**

## Status

**Built and driven in a browser on `claude/focused-davinci-u1052a`**
(2026-09-22). Spec written first at the user's request —
`docs/specs/53-dashboard-analytics-and-market.md`, whose §8 is now what was
measured and §9 the four decisions as they were taken.

**A purchase order is not in a market, and everything here follows from
that.** A market is a column on `Product`; one document can carry a Vietnam
line and a Mydin line. So sales by market are summed from **line amounts**,
never order totals, and `Σ(markets) ≤ Σ(lines)` always — the gap being lines
that matched no product and products carrying no market. The market mix card
prints that gap in words rather than leaving the reader to take the market
columns for the whole business.

**The filter narrows the lines**, chosen by the user from three readings
offered before building. With `?market=Mydin` every figure counts only
Mydin's lines. **The cost is stated rather than hidden:** Total sales
relabels itself *Sales in this selection*, the average says *"per order, of
these lines"*, and the purchase-order table — whose rows are whole orders and
cannot narrow — carries a caption saying it lists the orders that *touch* the
selection at their full value, so its totals being larger is a fact rather
than a contradiction. The alternative, keeping matching orders whole, was
**watched failing**: one order spanning two markets counted fully in both and
the markets summed to 200 where the lines were 100.

**Brand and category filter the same way**, at the user's request against the
recommendation of market alone. All three are columns on the same product, so
they compose by intersection and the summary line names each part.

**One trend card, three subjects.** `?trend=market|buyer|product`, up to six
series, over the page's own buckets — the user's choice over three separate
cards. It is the buyer page's own multi-series chart generalised rather than
a second one written: `unitsPerBucket` became `seriesPerBucket(orders, ids,
keyFn, valueFn, …)` in `trend.ts`, and `ProductTrend` became a thin adapter
over a shared `SeriesTrend`, holding the buyer page's own vocabulary so
"products" never leaks into a component the dashboard also draws.

**The measure is not the trend card's own.** It reads the `?measure=` the
sales card above it writes, so the page can never draw money in one chart and
cartons in the other without saying which.

**The market picker reads the unfiltered pass; buyer and product read the
filtered one.** Narrowing to Vietnam must never remove Mydin from the control
that would take you back; offering a buyer the chart would draw as flat zero
is the worse failure the other way.

**On-time delivery is the one figure that does not narrow to lines**, and
saying so is its design. On time is a property of the order, so an order
spanning two markets counts in both — it let both down. That would inflate a
*sum*, which is why money is never treated this way; it does not inflate a
*rate*, and the caption says whose orders each row is over so nobody adds the
column up. It refuses three things outright: an order with no expected date
(counted separately, never as on time), an order not yet delivered however
late it looks (that is the demand board's Overdue column, and two screens
disagreeing about "late" is worse than one not saying), and a market with
nothing delivered, which prints `—` rather than 0%.

**A filter naming something nothing in range carries is dropped, not
honoured.** Writing the acceptance criterion is what caught that it had not
been built: the page passed `?market=` straight through, so a stale value
would have drawn an empty board with the select still showing it.
`resolveFilter` drops it, the query echoes the *resolved* filter back, and
the selects and the table read that rather than the URL.

**Also added, all from the payload already fetched:** a Sales-by-market
donut, a Market-mix card comparing each market's share against the period
before (a market arriving from nothing prints "New", not "+15pp" against a
base that never existed), and three in-range tiles — Markets sold into,
Repeat buyers, and cartons per order folded into Items per PO. Margin and
stock turn stay out: the portal holds no cost, and `stockCartons` is null on
every product.

## Verified, with the figures

**Driven in a real browser against a real database** — the first time in
several phases. This container has no Neon endpoint, so a local Postgres 16
was stood up, the project's own seed run against it (423 purchase orders,
1,683 line items, 12 products), three markets written onto the catalogue and
two products deliberately left with none. `src/lib/prisma.ts` and
`prisma/seed.ts` were pointed at a local adapter for the drive and
**restored afterwards**; the cluster was stopped and deleted, and
`package.json` and `package-lock.json` are untouched.

- **The market figures reconcile to the cent, against SQL rather than against
  themselves.** Over 24 Aug – 22 Sep: Mydin **284,164.69**, Super Indo
  **127,676.43**, Vietnam **298,116.24** — summing to **709,957.36**, the
  exact figure the market mix card prints as attributed — plus No market
  **194,973.49** = **904,930.85**, the database's own total line value. Every
  one of those five figures matches its SQL equivalent exactly.
- **The filter narrows everything.** `?market=Mydin` read **RM 284,164.69
  across 30 purchase orders** against **RM 904,930.85 / 42** unfiltered; the
  KPI relabelled **"Sales in this selection"**, its caption **"RM 9,472.16
  average per order, of these lines"**, and the summary **"24 Aug 2026 –
  22 Sep 2026 · 30 purchase orders · Mydin only — every figure below counts
  only these lines."** The market donut and the market mix card were
  **absent** (one slice is not a chart), and the table carried its
  full-value caption.
- **`?market=*none` read RM 194,973.49** — exactly the lines on products
  carrying no market.
- **All three trend subjects draw:** *3 of 3 markets* (Vietnam, Mydin, Super
  Indo), *6 of 11 buyers*, *6 of 12 products*.
- **The measure is shared:** `measure=sales` → sales card *"RM 904,930.85
  across 30 days"*, trend *"Sales per period"*; `measure=units` → trend
  *"Cartons per period"*.
- **On-time delivery** read Super Indo **5/10 · 50%**, Vietnam **6/10 · 60%**,
  Mydin **6/10 · 60%**, worst first, over 16 delivered orders.
- **Phone.** **390/390 with the disclosure closed *and* open**; 1440/1440 on
  the desktop, filtered and unfiltered. All three new selects measure
  **44px**. The only sub-44px controls are the donuts' two "Other (n)" unfold
  buttons at 21px, the pre-existing class.
- **Four counterfactuals watched failing**, then restored: keeping matching
  orders whole (`expected 200 to be 100` — the inflation the design rejects);
  dropping unattributed lines from the denominator (`expected 150 to be
  200`); comparing delivery dates in UTC rather than Kuala Lumpur (`expected
  100 to be +0`); and honouring a market nothing in range carries
  (`expected { market: 'Atlantis' } to deeply equal {}`).
- **1411/1411 tests across 110 files** (49 new), `tsc`, lint (the same 2
  pre-existing `username` warnings) and `npm run build` clean — the build run
  before the local stand-ins were removed.
- **The type system found every call site.** Adding three columns to
  `AnalyticsLineItem` and a date to `AnalyticsOrder` turned nine files red —
  seven fixtures and two real queries — which is the evidence that no caller
  was left guessing a market.

### Three defects the drive found that the build could not

Two were **pre-existing**, in cards the *More analytics* disclosure hides —
which is why the 2026-09-06 mobile sweep never saw them: it measured the
dashboard with the disclosure closed.

- **The page overflowed at 390 with the disclosure open, 563 against 390.**
  Churn, price drift and every donut sat **543px wide in a 350px grid
  track** — a grid item's default `min-width: auto` refusing to shrink, the
  same defect Phase 25 fixed on `/admin/customers`. `min-w-0` on each card.
- **Then 411 against 390**, from the donut legend: at 390 the 168px ring left
  it **108px**, and each row's `shrink-0` money figure is **90px**, so the
  figure spilled past the card. The legend takes `basis-full` below `sm` now
  and goes back beside the ring above it.
- **The third was this phase's own, and only the screenshot showed it.** With
  three series over thirty daily buckets the point labels **collided across
  series** — `RM 5,206` printed over `RM 5,183`. `useLabelStep` spaces labels
  along one series and cannot see the others, so the trend card prints them
  only when a single series is drawn and leaves the tooltip to answer the
  rest.

**A measurement trap worth not re-deriving:** the KPI tiles count up over
~2s, so a script sampling at 700ms reads a mid-animation figure. A first
reconciliation pass did exactly that and reported the markets summing
28,792.15 short — a defect that was not there. Sample after 3s.

## Not verified

- **Anything on production**, and no production or development database was
  read or written. Every figure above is the project's own seed with markets
  written onto it by hand; production's market list is the customer's own and
  will be longer.
- **A line that matched no product.** All 1,683 seeded lines resolve to one,
  so the `noProduct` half of the unattributed figure was only ever read as
  **RM 0.00**. The split is covered by unit tests and has never been seen
  carrying a value.
- **The buyer page's own trend, on screen.** All 1,375 pre-existing tests
  pass unchanged after the refactor, but the page was not reopened — the
  claim that it renders identically rests on the adapter passing the same
  strings and formatters, not on a before-and-after.
- **The stale-filter fallback in a browser.** `resolveFilter` is covered by
  four tests and one counterfactual; the local database was already torn down
  when it was written, so no URL was driven.
- **The query count.** No counter was attached. That the page is still one
  fetch is structural — three columns on two existing selects, no new
  `prisma` call — rather than measured.
- **The colour-slot behaviour on the new card.** Deselecting the first of
  three and watching the other two keep their hues is the buyer page's
  mechanism carried over unchanged; it was not re-driven here.
- **Two products with the same name.** The product trend's legend showed
  *"ZEN 2.1L — Goat's Milk"* twice — two real products differing only by
  market. Legible enough to notice, ambiguous enough to record: the fix is in
  how the catalogue names variants, not in the chart.
- **`npm run build` without a stand-in for `xlsx`.** That package installs
  from cdn.sheetjs.com, which this container's network policy answers 403 to.
  A local stand-in was written into `node_modules` for the build and
  **deleted afterwards**, which is why the 111th test file still fails here.

## Previous phase

**The catalog by market**

## Status

**Built on `claude/focused-davinci-u1052a`** (2026-09-21). Asked for as: "In
product catalog, split the Product by Market, so its easier to maintain and
monitor".

**A third thing a row can be**, beside Products and Families: `?by=market`,
one row per market with its products, active, brands, units, revenue, buyers
and how many of its products need fixing. **The shape was the user's**, chosen
from three offered before building — a Markets view, market sections inside
the product list, or both.

**Markets were already a filter; this makes them a set of rows**, and that is
the whole difference. The filter answers "show me Vietnam"; it cannot answer
"how is Vietnam doing against Mydin, and where is the work" without choosing
each market in turn and remembering what the last one said. Monitoring is
reading down a column. Maintaining is clicking the row.

**The mirror of `groupFamilies`, deliberately.** A family is one product
across its markets; a market is many products in one place. Both sum from the
same sale rows the product rows use, in the same twelve-month window, from the
same single `listProducts` call — so a market's revenue is exactly its
products' revenue added up and no two figures on the page can disagree.

**Distinct orders and buyers, counted across the market rather than summed per
product.** Two of a market's products on one purchase order is one order and
one buyer. **Watched failing:** accumulating them per product instead reports
`expected 2 to be 1` — a market read as busy as its products are bought
together.

**The products carrying no market are a row, not an omission.** It is the
maintenance case the view exists for: a product with no market is invisible to
every market question asked of the catalogue until somebody gives it one, and
counting it nowhere is how it stays invisible. It is pinned last whatever the
sort, like the family view's unplaced row. **Watched failing:** let it sort
with the rest and it leads the ascending board, `expected 'Vietnam' to be
'*none'`.

**Unlike the family view's unplaced row, it prints its real "N to fix"** where
that one prints "Unplaced". A product with no market is not by itself broken,
so the label would replace the only figure that says whether the row needs
opening.

**The sentinel is `*none`, not `none`.** `NO_FAMILY` keys on ids, which are
cuids nobody types; a market is free text entered into a growing list, where
`none` is a plausible thing to write and would then be unreachable behind its
own sentinel. **Watched failing:** with the plain `none`, a market actually
called "none" returns the unplaced products instead of its own.

**The market select gained a "No market" option**, because the remainder row
now links to exactly those products and a filter you cannot see or clear is
the defect this project keeps fixing. It is not the blank option yesterday's
rule refused — that rule drops the *empty* values, and this is a named one,
offered only while some product carries none.

**Brand and category are absent on market rows, and that is the same call the
market select already makes on family rows.** A market spans both by
construction, so those selects could only mean "count just this brand's
products inside each market" — narrowing what a row *counts* where on the
family view the identical control narrows which *rows show*. One control with
two meanings is worse than one that is absent. They are dropped from the URL
on the way in for the same reason.

**Brands is the reciprocal of the family view's Markets column** — unsortable
there, unsortable here. A product carrying no brand adds none, unlike a
family's market count, which counts a null because the shop draws a "No
market" section the column has to agree with.

The sorts narrow to the three a market row can answer — Revenue, Units, Name —
the same way the family view drops list price and drift. The attention chips
and the grid/list switch go with them: an aggregate row carries no flag and is
not a card.

## Verified, with the figures

**No browser drive.** This container has no `.env.local` and no Neon endpoint,
so no screen could be signed into. What was measured instead, on the **real
components rendered through `renderToStaticMarkup` and laid out in headless
Chromium against the production stylesheet** from `npm run build` — the same
markup and CSS the app serves, and the method the 2026-09-20 entry used for
the same reason.

- **The rows read as a board**, off the rendered page:
  `Mydin | 41 | 40 | 3 | 13,120 | RM 278,169.42 | 7 | 2 to fix`,
  `Super Indo | 28 | 28 | 2 | 8,120 | RM 171,900.12 | 7 | OK`,
  `Vietnam | 17 | 13 | 2 | 3,740 | RM 83,399.96 | 7 | 4 to fix`, and
  **`No market | 12 | 12 | 2 | 480 | RM 10,100.04 | 7 | 9 to fix` last**.
  Headers `Market · Products · Active · Brands · Units · 12m ·
  Revenue · 12m↓ · Buyers · Status`.
- **Every row opens its own products**, read off the `href`s:
  `/products?market=Mydin`, `/products?market=Super%20Indo`,
  `/products?market=Vietnam` and **`/products?market=*none`**.
- **The toolbar drops what a market row cannot answer.** On `?by=market` the
  brand, category and market selects are **absent** (3 → 0), the attention
  chips **0 of 7**, the grid/list switch **absent**, and the sorts read
  **Revenue · Units · Name** against the product view's six. The By strip
  reads **Products · Families · Markets** on both.
- **The market select offers the way back**, read off the product view's own
  options: **All markets · Mydin · Super Indo · Vietnam · No market**.
- **Phone.** At 358 — the content width a 390 viewport leaves — the page does
  not overflow (**358/358**), `DataTable` drops to card mode (the table
  measures **0px**), and **every control is 44px**: the search, the three By
  segments, the three sorts, the card-mode Sort select and its direction
  button. The only four elements under 44px are the card-mode title links at
  **284×24**, the class accepted since 2026-09-11. Desktop **1136/1136**.
- **Three guards watched failing** against the plausible wrong
  implementation, not against nothing: orders and buyers summed per product
  rather than counted distinct; the remainder row left to sort with the rest;
  and the sentinel written as a plain `none`. Each was restored and re-run.
- **1375/1375 tests across 106 files** (13 new — 10 on the grouping and the
  ordering, 3 on asking for the products carrying no market), `tsc` and lint
  (the same 2 pre-existing `username` warnings) clean, and `npm run build`
  clean with `/products` still a dynamic route.

## Not verified

- **Anything on production**, and no production or development database was
  read or written. Every figure above is a fixture shaped like the real
  catalogue, not a row.
- **The view in a running app.** No page was opened, nothing was clicked, and
  no URL was driven: the components were rendered and measured, the page that
  composes them was not. In particular the `by` switch's **dropping of brand
  and category** is argued from the code and its shape, not watched in a
  browser, and so is the fallback when `?by=market` arrives with a
  product-only `?sort=`.
- **Web fonts.** The measurement page loads the production CSS from `file://`,
  so Plus Jakarta Sans and Inter fell back to the system serif — the widths
  above are indicative of wrapping, not exact to the deployed typeface.
- **A long market name.** The Market cell truncates at `max-w-72` with the
  full value in `title`, unexercised: the longest tried was "Super Indo".
- **Many markets.** Four rows were drawn. Production's market list is the
  customer's own and will be longer; the view pages at the table's default
  size, and how it reads at nine or nineteen was not seen.
- **`npm run build` and `tsc` without a stand-in for `xlsx`.** That package
  installs from cdn.sheetjs.com, which this container's network policy answers
  403 to, and nothing here can run while it is missing — so a local
  stand-in was written into `node_modules` for those two commands and
  **deleted afterwards**. Nothing in the repository depends on it, and it is
  why the 107th test file still fails here, as it has since 2026-09-20.

## Previous phase

**A name, a printed board, and a market filter**

## Status

**Built and driven in a browser on `claude/session-cloud-location-aszckl`**
(2026-09-21). Asked for as three things: "Rename the sidebar Demand board to
Demand Board, make sure use this pattern accross the page, remember this
naming convention"; "In side demand board, let user print the current page and
download it as pdf"; "Also, in product page, add a filter by market".

**A destination's name is Title Case, and that is now a written rule.** The
sidebar read `Purchase Orders` beside `Demand board` — two labels of the same
kind set two different ways. The convention is recorded in three places rather
than fixed in one: `docs/specs/00-master.md` §4 (above the sentence-case rule
it is the exception to), `context/design-system.md`'s overview, and
`CLAUDE.md`. It covers the name **wherever it is used as a name** — the nav
row, the page's own `<title>`, prose naming the destination — and deliberately
not headings, captions, buttons or column headers, which stay sentence case.
`nav.test.ts` pins it, because a later edit lower-cases a label back without
meaning to. **Watched failing:** with the label put back to `Demand board`,
two tests go red — `expected 'Demand board' to be 'Demand Board'`.

**`short` is untouched.** The phone tab bar is five tabs at 78px and shows
"Demand"; the rename is the full name, not the abbreviation.

**One control prints and saves the PDF**, because they are the same act: every
browser's print dialog offers "Save as PDF" as a destination, so a second
route to a file would be a second renderer to keep in step with the screen.
The button says so — **Print or save as PDF**.

**The board is scaled to the page before it prints, and that is the whole
mechanism.** Thirty day columns are ~2,376px and a landscape A4 page holds
~1,032, so left alone the right-hand columns are simply cut off — the failure
the on-screen scroller exists to prevent, arriving on paper. CSS cannot
measure, so `PrintBoard` reads the board's real `scrollWidth` and sets `zoom`,
the property the purchase-order sheet already prints through. **Measured, not
argued:** the daily board rendered to a real A4 landscape PDF loses **Orders**
and **Stock count (carton)** unscaled across 2 pages, and carries all six
fixed columns on **1 page** scaled.

**It only ever shrinks.** A four-column board prints at its own size rather
than being blown up to fill the sheet, which would make it look like a
different document from a twelve-column one. `printScale` returns `null`
there so the caller clears the property instead of pinning it to 1, and
refuses a width of zero rather than dividing by it — an element not laid out
yet would otherwise blank the page. **Watched failing:** allowed to stretch, a
600px board scales to 1.72 and that test goes red.

**The zoom is put back by `afterprint`, not by the line after `print()`.**
`window.print()` blocks in some browsers and returns immediately in others, so
resetting inline would leave the paper scaled in one and the screen scaled in
the other. `afterprint` fires on cancel too.

**What prints and what does not.** The heading and the summary line stay — a
board on paper with no window and no total is a grid of numbers nobody can
place — and so does the amber callout that explains the blank stock columns.
The toolbar and the button take themselves out through `data-print-hide`. In
print the scroller unscrolls, the edge fades go (a gradient saying "more this
way" is a lie once the whole board is on the page), and the pinned Product
column goes `static`, since a column pinned against a scroller it no longer
has would ride over the columns beside it.

**Market filters products, and is not offered on family rows.** A family row
spans its markets by construction and `FamilyRow.markets` is a *count* rather
than a list, so there is nothing for the filter to match a family against —
better absent than present and inert. It is dropped from the URL on the
Products ↔ Families switch for the same reason `filter` already is: a filter
the reader can neither see nor undo is worse than one that resets.

**A product carrying no market matches no market.** It is not in a market
called nothing, so the options list drops the empty ones rather than offering
a blank, and "All markets" — which arrives as no filter at all — is how you
ask for those products back.

**The options come from the rows already fetched**, like brands and
categories, so the filter can never offer a market that would match nothing.
The three selects finally share one class constant instead of a third
near-copy of it.

## Verified, with the figures

Development, port 3000, as the seeded super admin, with three markets put on
the seeded catalogue for the drive.

- **The name.** Sidebar reads `Dashboard · Purchase Orders · Demand Board ·
  Buyers · Products`; the tab title is **"Demand Board · Zen Garden Portal"**;
  `Demand board` appears **0 times** in the rendered page. The phone tab bar
  is still five tabs at **78 × 56px** labelled **Demand**.
- **Print, measured as real PDFs** rendered at A4 landscape with 12mm margins
  — not print-media emulation, which does not resize the page:
  - **daily unscaled: 2 pages, 4 of 6 fixed columns**, missing Orders and
    Stock count (carton). **Daily scaled (0.434): 1 page, 6 of 6.**
  - weekly and monthly fit either way and run to 2 pages on height, with the
    header row repeated on page 2. Monthly's missing Overdue column is the
    existing grain-relative rule, not the print.
  - The weekly PDF carries **"What is committed"**, **"26 open orders"**,
    **"2,669 cartons"**, **"Stock is not counted yet."** and the **"Total
    cartons"** footer, and carries **none** of "All open", "Next 4 weeks" or
    "Print or save as PDF".
  - Under print media the toolbar computes `display: none`, the sidebar
    `visibility: hidden`, the heading and table `visible`, the scroller
    `overflow-x: visible`, the pinned column `position: static`, and **0**
    edge fades remain.
- **Market filter.** The select offers **All markets · Mydin · Super Indo ·
  Vietnam**, read off the rendered page. `?market=Vietnam` took **12 products
  → 3**; adding `&category=Shower cream & gel` took it to **1**. Choosing
  Mydin from the select itself wrote `?view=list&market=Mydin`. On
  `?by=family` the select is **absent**.
- **Phone.** `/demand` and `/products` both **390/390** with **no control
  under 44px**.
- **The console is clean.** The only failed request is
  `va.vercel-scripts.com/v1/speed-insights` — this container's blocked egress.
- **1362/1362 tests across 105 files** (11 new), `tsc`, lint (the same 2
  pre-existing warnings) and `npm run build` clean. The 106th file,
  `catalog-import.test.ts`, fails to import in this container only — `xlsx`
  installs from cdn.sheetjs.com, which the network policy answers 403 to.

## Not verified

- **Anything on production.** Not deployed, and no production row was read.
- **A print from a real dialog, on paper or through a real Save as PDF.**
  Every PDF above came from Chromium's own print pipeline at the right page
  size, which is what the dialog drives — but no dialog was opened, and no
  other browser was tried. Safari and Firefox honour `zoom` differently and
  were not checked.
- **The market filter on real data.** Development's catalogue carries no
  market at all, so three were written onto the 12 seeded products for the
  drive. Production's markets are the customer's own list and will be longer —
  a plain `<select>`, unsearchable, and how it reads at nine was not seen.
- **A board wide enough to need the ceiling.** 30 day columns were printed;
  365 — the daily ceiling — would scale to about 0.05 and be unreadable. The
  scale has no floor, and nothing warns that a board has been shrunk past
  legibility.
- **Whether a family-row market filter is wanted.** It is left out because
  `FamilyRow` carries a count rather than a list; making it work is an
  aggregation change, not a filter change.

## Previous phase

**Reading the demand board down to one order**

## Status

**Built and driven in a browser on `claude/session-cloud-location-aszckl`**
(2026-09-21). Asked for as five changes at once: "Show PO Date, Expected
Delivery Date, Due in how many days"; "For window, open options for next
unlimited day, let user pick. default next 30d, remove Next 7days"; "Rename on
hand to stock count (carton)"; "Also add search bar to search anything"; "Add
filter for family, product, overdue".

**Trimmed, then given a date, the same day.** First "make it next 30d or 60d"
and "Remove overdue only": the window went back to three chips — **Next 30
days · Next 60 days · All open** — and the typed span box and the Overdue only
filter both went. Then "What about letting user to pick the extended date? I
will want that", which put the custom window back in a different form: a
**date** beside the chips, not a number of days. Asked before building, with
three shapes offered; the date was chosen. The paragraphs below are corrected
rather than deleted, because the reasoning that produced them is what these
changes reverse.

**Three decisions were the user's**, asked before building and all three taken
as recommended: the dates are labelled lines on the sub-row rather than three
new columns; the window is presets plus a box you type any number into; and
the search narrows the *lines*, so **every figure on the board follows it**.

**Both dates are labelled, because two bare dates a line apart are
indistinguishable.** A sub-row now reads `PO date 31 Aug 2026` over
`Expected 12 Sep 2026 · 9 days late`. Three new columns was the alternative
and was rejected for a reason worth keeping: a product row has many orders and
so has no single PO date, so those columns would be blank on every row that is
not a sub-row, while pushing thirty day columns further right.

**How soon, in the same place as how late.** `due in 6 days`, `due today`, and
— the case that needed deciding — `due 14 days ago`. Lateness on this board is
measured *at the grain being read*, so a monthly board can carry an order
whose date is a fortnight gone in September's column rather than in Overdue.
`dueInDays` is real calendar days and is allowed to go negative rather than
rounding up to "due today", which would be the board rounding in its own
favour. The red `N days late` caption stays grain-relative, and the two never
both show.

**The window is two spans, everything, or a date.** `Next 7 days` is gone and
daily opens at **30**, beside **Next 60 days** and **All open**. The typed
number box that first replaced the old menu lasted a few hours: it was built
because the complaint was a window boxed in at a fortnight, and once the chips
read 30 and 60 it was a third control for a question the two chips answer,
carrying a defect of its own — it initialised once, so navigating to a chip
left it reading a stale `14` beside "Next 30 days" selected, which is what the
user was looking at when they asked for it to go. A chip and a date answer the
same question, so writing either clears the other: the board can never be
showing two windows at once.

**Past 60 days, a planner picks a date.** `or up to [12 Mar 2027]`, beside the
chips, writing `?until=`. A date rather than the number of days it works out
to, because that is the form the question already has: somebody needs to see
through the end of the quarter, and does not know that is 187 days. It also
survives a grain change where a number cannot — "up to 12 March" asks the same
thing of days, weeks and months, while "12" means a fortnight, a quarter and a
year — so clicking Monthly keeps the date and only the column count moves.

**The span is counted by walking the buckets, not by arithmetic on the grain.**
`windowUntil` asks `makeBuckets` how many periods reach the date, the same walk
that draws the columns, so "up to 12 Mar" cannot draw a board that stops on the
11th. A Sunday inside a week reaches that week rather than one fewer, and at
monthly grain an earlier day of the month the board opens on is one column, not
a refusal. **Watched failing:** counting days arithmetically instead turns three
tests red, including `expected 36 to be 6` where a weekly window is asked for.

**The ceiling is a `max` on the picker and a refusal in the URL**, which is two
behaviours for one rule on purpose: a calendar that offers a date the board
then declines is a worse control than one that greys it out, while a
hand-typed `?until=2030-01-01` at daily grain is a typo and falls back to the
grain's default rather than being clamped. `lastPickableDate` and `windowUntil`
are pinned to the same day by a test, so the two cannot drift apart.

**A date already gone is refused rather than drawn**, and that needed saying in
code: `makeBuckets` returns *one* bucket for a backwards range, so a length
check alone reads "up to last Tuesday" as a valid one-column board. The order
is compared on the bucket keys instead. **Watched failing:** with the check
removed, that test goes red.

**The page resolves the window once, and the toolbar renders what came back** —
never the raw URL. That is what keeps a refused date out of the picker: a board
that fell back to Next 30 days shows an empty field and the chip it is actually
drawing. It is also the defect class that killed the typed box, fixed by
construction rather than by care.

**The ceilings are 365 days, 260 weeks, 120 months**, and they are not
opinions about how far ahead to plan — the old ones (a fortnight-ish per
grain) were the thing being complained about. They are the point past which a
URL is a typo rather than a question. Every one of them already draws more
columns than a screen holds, and "All open" can draw more still.

**Search narrows the lines, so the figures cannot lie.** Searching a buyer
leaves their orders alone on the board and a row's cartons, Committed and
Orders are that buyer's alone. The alternative — filter the breakdown, keep
the totals whole — would put 550 committed above three sub-rows summing to 46,
which is the exact failure the per-order grouping exists to prevent, arriving
by another door. The summary line says which it is showing: "every figure
below counts only what matches."

**Totals are summed from the rows that survived**, rather than accumulated as
the lines go past. That is what makes the previous paragraph true by
construction instead of by discipline: the footer is the rows above it, and no
filter can leave it counting a row it removed.

**Overdue only is gone**, at the user's request, and with it the one filter
that narrowed rows rather than lines. It was built on the argument that a
planner chasing a late order needs to see what else that product has coming —
which is exactly why it earns its removal rather than a rewrite: the Overdue
column is already the first column on the board, red, and sorts itself to the
eye without emptying anything. A saved link still carrying `?overdue=1` is
**ignored**, not half-applied: the board reads the same 26 orders and 12 rows
as a plain one.

**The pickers read the whole board, never the filtered one.** Family and
product options come from the unfiltered pass, so narrowing to one family
never removes the other families from the control that would take you back.
That cost nothing extra: the query already reads every open line and
aggregates in memory, so the filters are applied in that same loop and the
option lists fall out of it. Search does not push down to SQL, which is the
same swap point the module already records — past a few thousand open lines
this wants the filter in the `where`.

**On hand is Stock count (carton)**, in the header and in the amber callout
that explains why it is blank.

## Verified, with the figures

Development, port 3000, as the seeded super admin, board opening 21 Sep 2026.

- **The sub-row reads as a record.** `Meridian Chemicals / PO number
  PO-2026-0039 / PO date 31 Aug 2026 / Expected 12 Sep 2026 · 9 days late /
  Delivering`, and below it `Tanjung Electrical / PO-2026-0027 / PO date
  14 Sep 2026 / Expected 27 Sep 2026 · due in 6 days`, `Acme Industrial Sdn
  Bhd / … · due in 2 days`, `Sunway Packaging / … · due in 7 days`.
- **The window is three chips and a date.** Read off the rendered toolbar:
  **Next 30 days · Next 60 days · All open**, Next 30 days selected,
  **36 columns**, and the date field empty with `min 2026-09-21` /
  `max 2027-09-20` — today and the 365-day ceiling. Clicking Next 60 days gave
  `?by=day&window=60` and **66 columns**.
- **Typing a date into the picker drives the board.** `2026-11-15` gave
  `?by=day&until=2026-11-15`, **62 columns** ending **15 Nov**, and **no chip
  selected**. `?until=2026-12-31` gave **108 columns** ending **31 Dec**.
- **A grain change keeps the date; a chip clears it.** With the date set,
  clicking Monthly gave `?by=month&until=2026-11-15` — the field still reading
  2026-11-15, **8 columns** ending **Nov 2026**. Then clicking Next 6 months
  gave `?by=month&window=6` with the field **empty** and the chip selected.
- **Three bad dates all fall back rather than drawing something wrong.**
  `?until=2026-01-01` (already gone), `?until=2030-01-01` at daily grain (past
  the 365 ceiling) and `?until=not-a-date` each read **36 columns, Next 30 days
  selected, and an empty date field** — the picker never showing a date the
  board is not drawing. The **same** `2030-01-01` at monthly grain, where it is
  inside the 120-month ceiling, drew **46 columns** ending **Jan 2030**.
- **A date composes with the filters.** `?until=2026-10-01&q=Meridian` drew
  **17 columns** ending **1 Oct** with the search still applied.
- **No Overdue only control, and a stale link carrying it is ignored.** Buttons
  matching `/overdue/i` counted **0**. `?by=day&overdue=1` read
  **26 open orders · 2,669 cartons · 12 rows** — character for character the
  plain board — while `?q=Meridian` on the same pass still narrowed to
  **2 open orders · 157 cartons · 6 rows** and said "every figure below counts
  only what matches."
- **Search narrows every figure, and the breakdown still adds up.** Unfiltered:
  **26 open orders · 2,669 cartons**. Searching `Meridian`: **2 open orders ·
  157 cartons · "every figure below counts only what matches."** Expanding the
  lead row, the parent reads `34 | — | 16 | — | — | 50 | 2` and its **two**
  sub-rows sum to exactly `34 | — | 16 | — | — | 50`, both Meridian's.
- **A search with no match says so** — "Nothing on the board matches that.
  Clear the search or the filters to see every open order." — rather than
  drawing an empty grid.
- **Family and product filter, and the pickers stay whole.** With three
  families put on the seeded catalogue, choosing one gave **4 rows · 985
  cartons**, and the family select still offered **all 4 options** and the
  product select all **13** — a filter you can undo from the control that set
  it. The product filter narrowed to **1 row · 286 cartons**.
- **Four counterfactuals watched failing.** Accumulating totals as the lines
  go past rather than summing the survivors, so the footer outlives the filter
  that removed its row; deriving the pickers from the filtered rows, so the
  family list shrinks to the family already chosen; clamping `due N days ago`
  to "due today"; and filtering the breakdown while leaving the totals whole —
  which reported **42 where 30 was expected**, the figure-follows decision
  made visible.
- **Phone.** At 390 the toolbar stacks — grain, window, the date, search, the
  selects — with **no control under 44px** and no page overflow (390/390);
  1440/1440 on the desktop.
- **The console is clean.** The only failed request is
  `va.vercel-scripts.com/v1/speed-insights` — this container's blocked egress,
  not the page.
- **1351/1351 tests across 102 files**, `tsc`, lint (the same 2 pre-existing
  warnings) and `npm run build` clean. The 103rd file,
  `catalog-import.test.ts`, fails to import in this container only — `xlsx`
  installs from cdn.sheetjs.com, which the network policy answers 403 to.

## Not verified

- **Anything on production.** Not deployed, and no production row was read.
- **The family filter on real data.** The seeded catalogue places no product
  in a family, so three throwaway families were created for the drive and
  removed by id afterwards (families **0**, products placed **0**, purchase
  orders **421**, read back). On production every product has a family, so
  that select will be long — it is a plain `<select>`, unsearchable, and how
  it reads at 59 families was not seen.
- **A span near the ceiling.** 108 columns were drawn; 365 days — 371 columns
  — was not, and the board would be slow to lay out. The ceiling exists to
  stop a typo, not because that span was measured.
- **The date picker as a calendar.** Every date above was typed or carried in
  a URL. The `min`/`max` attributes were read off the element, but the browser
  popup was not opened, so whether it greys out the days past the ceiling the
  way the attribute asks was not seen.
- **A date picked on one grain and read on another in anger.** The switch was
  driven Daily → Monthly; the case where a valid daily date is *lost* by
  switching — it cannot be, since the daily ceiling is the tightest — is
  argued rather than driven, and the reverse (Monthly → Daily past 365 days)
  falls back, which was driven only by URL.
- **The search at volume.** It filters in memory over every open line, which
  is right at 1,672 and untested at a hundred thousand.
- **Keyboard and screen reader.** The chips and the selects were clicked, not
  tabbed to; the date field was filled programmatically, not tabbed into.
- **A saved link carrying a filter**, opened cold. Every control writes to the
  URL and the page reads it back, but only same-session navigation was driven.

## Previous phase

**What each demand figure is made of**

## Status

**Built and driven in a browser on `claude/session-cloud-location-aszckl`**
(2026-09-21). Asked for as: "For the demand board, how can we let the planning
team know the breakdown of each demand? lets say the total demand for a product
is 100, what's the breakdown? which PO is it from? which buyer? which market?"

**A product row opens in place, one sub-row per open order**, in the same
columns as the total above it. The caret expands; the product name still links
to the product. Each sub-row reads the buyer, the order's own identifier, its
expected date, how late it is if it is late, and its stage — then puts its
cartons in the period column the parent counted them in.

**Both identifiers, one line each, the buyer's first** (2026-09-21, asked for
as "show orderID too, underneath PO number"). The row leads with the buyer's
`PO number …`, which is the link, and puts our `Order ID W-…` underneath —
the reverse of `orderLabel`'s own preference, which serves surfaces with room
for exactly one, and right here because a planner chasing an order quotes the
number the buyer filed it under. **On separate lines, not joined by a `·`:**
the pair is the thing this row is read for, and a reader copying
`PO number ACME-PO-771 · Order ID W-2609-00014` has to cut it in half before
either half is usable.

**The Order ID line is absent, not dashed, where the order has none.** A
scanned purchase order was never given one — it is not a figure yet to come,
the way an uncounted stock level is — so a dash would be a fact about nothing
repeated down every sub-row of a board whose open orders are all scans, which
is what development holds. The same argument the market makes one paragraph
below. A shop order carrying no PO number leads with its Order ID and does not
then print it twice.

**The order's identifier is the link, and it never truncates** — fixed on
2026-09-21 after the user read it cut to `PO number PO-2...` on screen. Two
faults in one line: the caption was a `flex` row with `truncate`, and only the
identifier could give way (the date and the lateness beside it were
`shrink-0`), so on a late row it was squeezed to **107px of the 154px it
needs**; and the link was on the *buyer's name*, not on the thing a planner
carries out of the row. The caption now **wraps** rather than squeezes, the
identifier is `whitespace-nowrap`, and it is itself the link to
`/purchase-orders/{id}`. The buyer's name is what gives way instead, with the
full value in `title` — 00-master §4's truncation-recovery rule — and it is no
longer a link of its own: two links a line apart pointing at the same purchase
order read as two destinations to anything that lists them.

**Each part of the caption carries its own leading separator, spaces
included.** Flex items concatenate when a line is read out or copied, so
`PO-2026-0039· 12 Sep 2026` was two facts glued into one — the same defect
class as the `279d late` below, caught the same way. A leading space is
dropped at the start of a line box, so the gap on screen is still the
`gap-x-xxs`; and a part that drops to the next line does not strand a `·`
above it.

**Expanded in place rather than in a panel, and that is the whole point.** A
planner reading `371` asks two things at once — who wants it, and does that add
up — and only sub-rows in the same grid answer the second. The breakdown lands
under the figure it explains, so the addition is visible rather than promised.
The cost is width: a stage, a date and a link do not fit in a numeric column,
so they live in the product column, the one with room.

**One entry per purchase order, never per line item.** A document that prints
the same product twice is still one promise, to one buyer, on one date, so the
two line items collapse into one sub-row. That is also what keeps the breakdown
honest against the row it sits under: the number of sub-rows equals the row's
existing **Orders** figure, and their cartons sum to its columns. Grouping by
line would have made a row read "10 orders" above eleven sub-rows.

**Market is on the product, not on the order.** The question asked for market
too — but a row *is* one product, so its market (Super Indo, Lotus) is constant
down the whole breakdown and already sits under the SKU. Repeating it on every
sub-row would be ten copies of one fact. What varies per order is the buyer,
and that leads each sub-row.

**In the same payload, not a second fetch.** `loadDemandBoard` already reads
every open line and aggregates in memory; it now keeps what it was discarding.
A per-cell server action would add a spinner and a round trip for data already
in hand. The swap point is recorded rather than pre-built: past a few thousand
open lines, this wants `loadDemandCell(productId, bucketKey, grain)` on expand.

**The select stays narrow deliberately.** `Buyer.name` and nothing else —
`Buyer.remark` is an internal note about the customer, and a select that
reaches that row once tends to keep reaching it. Pinned by equality in a test,
the same guard `shop-viewer.test.ts` uses.

**How late, next to the date it is measured from** — `PO number PO-2026-0039 ·
12 Sep 2026 · 9 days late` — rather than inside the Overdue column. A numeric column carrying words
cannot be read across, copied or totalled by eye; the browser drive caught that
directly (see below). Days are real calendar days, so the figure reads the same
whichever grain is open, and the worst offender sorts first.

**The dash rule carries down**: a sub-row's empty period is `—`, not `0`. On
hand and Short by are left **blank** on a sub-row rather than dashed — stock is
held per product, not per order, so a dash there would answer a question nobody
asked of that row.

## Verified, with the figures

Development, port 3000, as the seeded super admin, board opening 21 Sep 2026.

- **The breakdown reconciles, measured rather than eyeballed.** MR.KING 1.5L —
  Lemon, expanded: parent columns **46 · 36 · 371 · 97**, committed **550**,
  orders **10**. Summing the ten sub-rows' own cells: **46 · 36 · 371 · 97**,
  committed **550**, **10** sub-rows. Columns agree, committed agrees, and the
  sub-row count equals the Orders figure.
- **The rows read as records.** `Meridian Chemicals · PO number PO-2026-0039 ·
  12 Sep 2026 · 9 days late · Delivering — 27 cartons`, and
  `Pacific Timber · PO-2026-0025 · 16 Sep 2026 · 5 days late · In warehouse —
  19`. 27 + 19 = the parent's 46 overdue.
- **A defect the browser found that the tests could not.** With the lateness
  inside the Overdue column, the cell's text was `27` and `9d late` with
  nothing between them, so reading the column gave **474** where the parent
  said **46** — two figures glued into one. Visually it was two lines; to
  anything reading the text it was nonsense. Moving the caption beside the date
  fixed it, re-measured at **46**.
- **Expanding and collapsing:** 12 tbody rows → **22** with one product open →
  **12** again. `aria-expanded` moves `false` → `true`; the toggle is named
  "Show the 10 orders behind MR.KING 1.5L — Lemon".
- **Phone.** The toggle measures **44×44** at 390, and the page does not
  overflow expanded — **390/390**, and 1440/1440 on the desktop.
- **The cut-off identifier, measured both ways.** With the old markup put back
  and driven again, the two late rows read the identifier at **107px of the
  154px it needs**, `clipped = true`, `text-overflow: ellipsis` — on screen
  `PO number PO-2...`, which is what was reported. The unlate row below them
  was **154/154** and not clipped, which is why only some rows showed it. With
  the fix, **all ten** sub-rows read `scrollWidth === clientWidth`
  (155–156px), `white-space: nowrap`, `text-overflow: clip` — and the same
  **156/156** at 390, where the date and the lateness wrap to a second line
  instead.
- **Both identifiers on one sub-row, read off the screen.** With one open
  order made shop-sourced (a `WebOrder` fixture, `W-2609-00014` /
  `ACME-PO-771`, on the worst-overdue row), its cell reads
  `Meridian Chemicals` / `PO number ACME-PO-771` / `Order ID W-2609-00014` /
  `12 Sep 2026 · 9 days late` / `Delivering` — five lines, the Order ID
  **17px below** the PO number, `white-space: nowrap`. The other **nine**
  sub-rows are scans and print **no Order ID line at all**, which is the
  absence case on the same screen rather than in a test.
- **Neither identifier is cut, measured as text against its line box.** An
  inline `<a>` reports `scrollWidth` 0, so the line box is what answers it: at
  1440 the PO number needs **150px of 262px** and the Order ID **138px of
  262px**, `text-overflow: clip` on both, in a 338px cell. At 390 every line
  in the cell reads **212/212** — nothing clipped, and the pair still stacked.
- **The link is on the identifier, and it goes where it says.** One `<a>` per
  sub-row (counted), `href="/purchase-orders/po_u3q5jfok39ed69ytblfq"` on the
  text `PO number PO-2026-0039`. Clicked, it landed on `/purchase-orders/
  po_u3q5jfok39ed69ytblfq` titled **"PO number PO-2026-0039 · Zen Garden
  Portal"** under the heading **Meridian Chemicals** — the same buyer and the
  same number the sub-row named. Under the old markup that same click was on
  the buyer's name.
- **The captions read as sentences, not as glue.** All ten, off the rendered
  text: `Meridian Chemicals ⟶ PO number PO-2026-0039 · 12 Sep 2026 · 9 days
  late`, `Pacific Timber ⟶ PO number PO-2026-0025 · 16 Sep 2026 · 5 days
  late`, `Tanjung Electrical ⟶ PO number PO-2026-0027 · 27 Sep 2026`. Before
  the space was added to each separator they read `PO-2026-0039· 12 Sep 2026`.
- **Four of the six identifier guards were watched failing** against the old
  markup: the link is on the identifier, the identifier is never shortened,
  the buyer's full name is in `title`, and the separator carries its space.
  The two that passed either way are the ones asserting *absence* — exactly
  one link, and no lateness on an order that is not late.
- **Two more counterfactuals for the second identifier.** Leaving
  `orderLabel`'s preference in place (our Order ID leading, nothing beneath)
  turned the shop-order test red — `expected 'Order ID W-2609-00014' to be
  'PO number ACME-PO-771'`. Joining the two with a `·` on one line turned two
  component tests red: the one that requires a line break between them, and
  the one that requires the Order ID to be `whitespace-nowrap` in its own
  right.
- **The reconciliation still holds after the change** — re-measured, not
  assumed: parent **46 · 36 · 371 · 97**, committed **550**, orders **10**;
  sub-row sums **46 · 36 · 371 · 97**, committed **550**, **10** sub-rows.
- **The console is clean.** The only failed request is
  `va.vercel-scripts.com/v1/speed-insights/script.debug.js` —
  `ERR_TUNNEL_CONNECTION_FAILED`, this container's blocked egress, not the
  page.
- **The grouping guard was watched failing.** Keyed per line item instead of
  per purchase order, **two** tests go red: the entry count (3 line items
  reading as 3 entries where 2 orders exist) and the sums-to-parent check,
  whose fixture carries a doubled order for exactly that reason. The first
  version of that fixture did not discriminate — four distinct orders sum the
  same either way — so it was strengthened until it did.
- **1330/1330 tests across 102 files** (4 on the breakdown, 10 on the
  sub-row's identifiers, 2 on the query's composition rule), `tsc`, lint (the same 2 pre-existing warnings) and
  `npm run build` clean. The 103rd file, `catalog-import.test.ts`, fails to
  import in this container only — `xlsx` installs from cdn.sheetjs.com, which
  the network policy answers 403 to, and the local stand-in throws by design.

## Not verified

- **Anything on production.** Not deployed, and no production row was read.
  Every figure above is seeded data.
- **A product with one order**, and a product whose breakdown is long enough to
  scroll. The widest tried was ten sub-rows.
- **The breakdown at daily and monthly grain.** The sub-row puts its cartons in
  whichever column the parent counted them in, and the tests cover the
  bucketing, but only the weekly board was expanded in a browser.
- **A real shop order's sub-row.** The one driven above was a `WebOrder`
  inserted straight into the database against an existing scanned order, not
  one placed through the cart; every seeded open order in development is a
  scan. Deleted by id afterwards, `poNumber` restored to `PO-2026-0039` and
  read back, web orders **0** and purchase orders **421**.
- **A shop order with no PO number, on screen.** It leads with its Order ID
  and prints no second line; covered by two unit tests and never rendered.
- **An identifier long enough to need the second line to itself.** The caption
  wraps, proven at 390 where the date drops below it, but no label was long
  enough to wrap on its own.
- **Keyboard and screen reader.** The toggle carries `aria-expanded` and a
  named label, unexercised by anything but a click.
- **Expansion across a grain change.** Changing grain navigates, so the open
  set resets — correct, since the columns change, but not driven.

## Previous phase

**The demand board**


## Status

**Built and driven in a browser on `claude/session-cloud-location-aszckl`**
(2026-09-21). Asked for as: "build option A, put it in a new side tab named
Demand Board" — option A of three designs drawn for the planning team's own
master list (`docs/specs/51-planning-board.md`) — then "make it daily view
too", then "add monthly view too".

**A fifth portal destination, `/demand`, and no new table.** Every figure is
derived from orders already in the portal: a purchase order counts while its
stage is not `DELIVERED` and it carries an expected delivery date, its line
items are in cartons and resolve to a product. One row per product, time
across, most committed first.

**Three grains, one query.** Daily, Weekly and Monthly are the same board
read at three resolutions — `loadDemandBoard(grain, window)` buckets through
`bucketKey(date, grain)`, the analytics module the four Recharts charts have
used since Phase 06, so a day column, a week column and a month column cannot
disagree about which bucket an order falls in. Weekly is the default because
it is how the master list is laid out; daily is what a dispatch plan needs and
monthly is what a materials order needs, and the planning team reads the
spreadsheet for all three.

**The window follows the grain rather than being one list.** Four weeks, seven
days and six months are different questions, so the second chip strip changes
with the first: weekly offers **Next 4 weeks · Next 12 · All open**, daily
**Next 7 days · Next 14 · All open**, monthly **Next 6 months · Next 12 · All
open**, and switching grain resets the window to that grain's default
(`DEMAND_SPAN`: 6 months, 4 weeks, 14 days) rather than carrying a 12 across
from months into weeks, where it means a quarter rather than a year. A
hand-typed `?window=` is clamped — 24 months, 52 weeks, 92 days — because the
column count is what the browser has to lay out.

**Why nothing new had to be stored**, measured before building: `LineItem.unit`
reads **`carton` on all 1,672 seeded lines**, **100%** of lines resolve to a
product, and **all 421** purchase orders carry a delivery date. The demand half
of that spreadsheet was already in the database; only nobody had asked it.

**What the board refuses to do.** On hand and Short by render as `—` until
`Product.stockCartons` holds a figure, and an amber line above the table says
so in words rather than leaving a reader to infer it from a column of dashes.
A plausible-looking cover figure is the spreadsheet's own failure mode; the
board would rather be visibly incomplete than quietly wrong.

**Overdue is its own column, decided without asking.** An order whose expected
date has passed and which nobody has delivered is the most urgent thing on the
board. Folding it into the current bucket — the tempting simplification —
hides exactly that, so late cartons sit in their own red column and are still
counted in Committed. The column appears only when something is late.

**Late is measured at the grain being read**, and that is a decision rather
than a side effect. It means *earlier than the bucket the board opens on*, so
a delivery promised on the 2nd is five days late on the daily board, late on
the weekly one, and simply September on the monthly one — the month it was
promised in has not run out. A monthly board that called it overdue would be
reporting on a promise that is not yet broken. On the seeded data that shows
plainly: the same 250 cartons are a red Overdue column by week and part of
September's 1,856 by month, where the column does not appear at all.

**A dash is nothing promised, not a zero**, throughout. The same null-vs-zero
rule the stock count turns on. It carries most of the daily view: fourteen
columns across eight products are mostly empty, and a grid of zeros would
read as fourteen days of nothing ordered rather than a plan with gaps in it.
It carries the far end of the monthly view too, where a twelve-month window
runs out of orders long before it runs out of columns.

**Not `DataTable`.** That component pages, sorts by URL and drops to card mode
on a phone, all of which this board would fight: the columns are computed
rather than declared, a row is only meaningful read across, and there is
nothing to page — the window *is* the paging. It scrolls sideways inside its
own frame with the same `useEdgeFades` treatment Phase 11 gave the line-items
table, and the product column is sticky, which is what makes fourteen day
columns readable at all.

**The phone tab bar went from four tabs to five.** `grid-cols-4` was hardcoded
and a fifth destination would have wrapped the bar onto two rows. It is
`grid-cols-5` now, with a comment tying the number to `NAV`'s length, because
a Tailwind class built at runtime is not compiled.

**A break only the Next compiler found.** `DemandToolbar` is a client
component and it needed `DEMAND_SPAN` to reset the window on a grain change;
importing it from `@/lib/queries/demand` pulled that module's `prisma` import
into the browser bundle and the build failed. `tsc` and the whole suite were
clean at the time — the boundary is Turbopack's to enforce, not the type
system's. `DemandGrain` and `DEMAND_SPAN` live in `src/lib/planning/grain.ts`
now, which imports nothing but the analytics `Aggregation` type, and the query
module re-exports them so a server caller still has one import.

## Verified, with the figures

Development, port 3000, as the seeded super admin, against the seeded
catalogue, with the board opening on 21 Sep 2026.

- **Weekly reads true.** 26 open orders · 2,669 cartons. Headers
  `Product · Overdue · 21–27 Sep · 28 Sep–4 Oct · 5–11 Oct · 12–18 Oct ·
  Committed · Orders · On hand · Short by`. MR.KING 1.5L — Lemon leads with
  **550 committed across 10 orders** — 46 overdue, then 36 / 371 / 97. Column
  totals **250 · 751 · 1,363 · 305**, committed **2,669**.
- **Monthly is the same orders gathered up**, reached by clicking Monthly:
  **6 columns, Sep 2026 to Feb 2027**, the lead row reading **282 / 268** and
  the footer **1,856 · 813 = 2,669** — the same 2,669 cartons the weekly board
  totals, redistributed. **No Overdue column at all**, because nothing on the
  seeded data is dated before September, which is the grain-relative rule
  above made visible.
- **Next 12 months draws 12 columns**, Sep 2026 to Aug 2027, with the last ten
  reading `—`; "All open" draws the two months that actually carry orders,
  Sep and Oct.
- **Switching grain resets the window**: Monthly at `window=12` then Daily
  lands on `?by=day&window=14`, not on twelve days.
- **Daily is the same orders spread out**, reached by clicking the chips
  (`?by=day&window=14`): **14 columns, 21 Sep to 4 Oct**, the same leading row
  reading 46 overdue then `— — 4 — — — 32 159 41 — — — 171 —` for **453 across
  9 orders**, under the caption "Cartons wanted, by the day their order is
  expected."
- **Next 7 days narrows to seven columns** with the footer **250 · — · — · 180
  · 240 · 267 · — · 64 · 1,001** — a week's demand landing on three days, which
  is the thing the weekly column's single 751 cannot show.
- **Overdue renders red and separately**, on 6 of the 8 visible rows; two rows
  with nothing late read `—`. It carries the same 250 at both grains.
- **On hand and Short by are `—` on every row**, and the amber callout reads
  "Stock is not counted yet." with a link to enter counts — the true state of
  a catalogue where `stockCartons` is null everywhere.
- **The nav.** Sidebar reads Dashboard · Purchase Orders · **Demand board** ·
  Buyers · Products. On a phone the tab bar is **five tabs at 78 × 56px**,
  labelled Demand, still clear of the 44px floor.
- **The caption names the grain it is showing** — "Cartons wanted, by the
  day / week / month their order is expected" — read off all three pages.
- **No overflow** at 1440 (1440/1440) on all three grains, including the
  16-column twelve-month view, and at 390 (390/390) on monthly and daily; the
  table scrolls inside its own frame with the product column pinned.
- **The console is clean.** The one failed request is
  `va.vercel-scripts.com/v1/speed-insights` — this container's blocked egress,
  not the page.
- **1314/1314 tests across 101 files** (15 on the board, 4 daily and 4
  monthly), `tsc`, lint (the same 2 pre-existing warnings) and `npm run build`
  clean, with `/demand` registered as a dynamic route.
- **Five guards watched failing first.** Folding late demand into the current
  bucket (`const late = false`) failed two tests; bucketing daily through the
  week key put a Tuesday's cartons in Monday's column and failed the daily
  ones. For monthly, stepping the window by weeks instead of months
  (`STEP.month = addWeeks`) drew 2 columns where 6 were expected and lost the
  December delivery, and bucketing a month's lines through the week key failed
  three, including the one that says an earlier day of this month is not
  late.

## Not verified

- **Anything on production.** Not deployed. Production's open-order count and
  how many of its orders carry a delivery date were never read — every figure
  above is seeded data, and a production board could be much fuller or nearly
  empty.
- **A board with stock counted.** Every row on every screen read `—` for On
  hand, so the `shortBy` arithmetic is covered by its unit test alone and has
  never been seen on a page.
- **"All open" on real data.** It was driven by month here (two columns) and
  is unit-tested at every grain, but at daily it can produce a column per day
  out to the last delivery date in the database — how wide that gets on
  production was not measured.
- **A monthly board with something genuinely overdue.** The seeded catalogue
  holds nothing dated before this month, so the monthly Overdue column has
  never been rendered; that it appears is argued from the same `anyOverdue`
  flag the other two grains use, and from its unit test.
- **The edge fades**, which appear on horizontal scroll and were not scrolled,
  at any grain.
- **A member's view.** Read as a super admin. The board has no permission
  check of its own — it is a portal page behind the same `requireUser()` shell
  as the rest, and every staff role sees it.
- **Volume.** 8 products on 26 orders. The query reads every open line in one
  go and aggregates in memory, which is right at this size and untested at a
  thousand — and the grain multiplies the cells, not the rows.
- **Six months as the right default.** Nobody has said how far ahead this
  business orders materials; it is a figure chosen to match the twelve-month
  alternative's column count without filling the screen.

## Previous phase

**Stock is counted in cartons**

## Status

**Built on `claude/session-cloud-location-aszckl`** (2026-09-21). Asked for as:
"change current stock count piece to carton".

`Product.stockPieces` became `Product.stockCartons` in one renaming migration,
`20260924090000_product_stock_in_cartons`. The column shipped as pieces on
2026-09-20 and was wrong by the next morning.

**The order data is what settles it.** Measured on the seeded database before
changing anything: `LineItem.unit` reads **`carton` on all 1,672 lines**, and
every price, every document quantity and every shop line is per carton. The
planning team's own master list counts cartons too — its totals row is
literally `TOTAL CARTONS`. A piece count was the one figure in the portal
measured in a unit nobody trades in.

**The conversion is deleted, not renamed.** `lowStockBelow(packSize)` is gone.
The low-stock rule was `stock < packSize × LOW_STOCK_CARTONS`, because a
ten-carton threshold cannot be compared against a piece count without knowing
the pack — and for a product carrying no pack size that multiplication
silently became `× 1`, flagging at ten pieces where ten cartons was meant.
Now the comparison is `stockCartons < LOW_STOCK_CARTONS`, and `packSize` is
not read at all. **Watched failing:** with the old conversion put back, a
healthy 10-carton product flags as low (10 < 6 × 10) and that test fails.

**RENAME, not drop-and-add.** Nothing has been counted — production holds zero
non-null values — but a rename cannot lose a figure somebody enters between
this being written and being deployed, and a drop can. Recorded in the
migration: any value that does appear first would be wrong under the new
meaning and needs dividing by its pack size by hand.

**`packSize` keeps its own labels.** "Pieces per carton" on both forms is the
pack, not the stock, and is untouched. The labels that moved are the stock
ones: "Pieces on hand" → "Cartons on hand", the two `placeholder="Pieces"`
inputs, the detail page's `0 pieces` → `0 cartons`, and the card's footer
clause.

## Verified, with the figures

**No browser drive**, for the reason carried since 2026-09-20: `src/lib/prisma.ts`
connects through `PrismaNeon`, the Neon serverless WebSocket driver, and this
container has no Neon endpoint. What was measured instead:

- **The order data the decision rests on**, read from a seeded local Postgres:
  1,672 line items, **100% resolved to a product**, **one distinct unit** and
  that unit is `carton`. 421 purchase orders, 27 of them open, all 421
  carrying a delivery date.
- **1299/1299 tests across 100 files**, `tsc --noEmit`, lint (the same 2
  pre-existing `username` warnings — a third, `LOW_STOCK_CARTONS` unused, was
  introduced by this change and fixed rather than accepted: the tests now
  derive their figures from the constant instead of hard-coding 9 and 10) and
  `npm run build` clean.
- **The 101st file, `catalog-import.test.ts`, fails in this container only.**
  `xlsx` installs from cdn.sheetjs.com, which the network policy answers 403
  to; the local stand-in throws by design rather than returning wrong
  spreadsheet data. Nothing to do with this change — the file does not read
  stock.
- **137 references** were renamed across 19 source files; the four in
  `src/generated/prisma` came back from `prisma generate`.

## Not verified

- **Anything on production**, and the migration has not run there. It renames
  a column that holds no values, so it cannot fail on existing rows.
- **A figure typed into either form, in a browser.** The edit drawer, the
  create form's per-variant column and the single-variant field were not
  driven; the write paths rest on the actions' own tests.
- **The detail page's Stock row and the card's footer**, laid out. Text only,
  in cells that already existed.
- **Ten cartons as the right threshold.** Still nobody's stated figure.
- **Whether production holds a stock value already.** Read as zero on
  2026-09-20; not re-read today. If one exists before this deploys it is a
  piece count wearing a carton label.

## Previous phase

**Stock count, in the portal only**

## Status

**Built on `claude/session-cloud-location-aszckl`** (2026-09-20). Asked for as:
"lets add stock count for each products. Buyer cant see it on shop. Only show
it in portal".

`Product.stockPieces`, nullable, in one additive migration
(`20260923090000_product_stock`). **Four decisions were the user's**, asked
before building:

- **Typed by the team, never derived.** Nothing deducts it — not confirming a
  purchase order, not a fulfilment stage. It is a stocktake figure somebody
  keeps current, so no reversal rules were needed for a declined, deleted or
  edited order.
- **Pieces**, not cartons, and no carton figure printed beside it.
- **The shop is untouched.** Buyers order exactly as they did; nothing is
  blocked at a zero and no "out of stock" label appears, so the number cannot
  be inferred by trying.
- **All four portal surfaces:** the edit drawer and the new-product form, the
  product detail page, a column on `/products`, and a low-stock chip.

**Null is not zero, and the whole feature turns on it.** NULL means nobody has
counted; 0 means somebody counted and there is none. The detail page prints
`—` against a null and `0 pieces` against a zero, the list column prints `—`
and `0`, and the low-stock flag ignores a null while treating a zero as the
most urgent count there is. Without that split the flag would have lit up all
308 products the day it shipped — none of them carries a figure yet — and said
nothing about any of them.

**Stock is per variant on the create form, not shared.** Phase 39's form
enters one product and every flavour of it in one submit, and `stockPieces`
would have been a shared field like pack size — writing one count onto six
`Product` rows, a number nobody counted. It moved into `variantRowSchema`
beside the flavour, the code and the price, so the Variants table has a fourth
narrow column and the single-variant path has the field in the details card,
following the list price's own rule that a per-variant field lives in exactly
one place at a time.

**The low-stock line is measured in cartons and converted** —
`LOW_STOCK_CARTONS = 10`, times the pack size, falling back to ten pieces where
the pack size is unknown. A flat piece threshold reads the wrong way round: at
100 pieces a 6-per-carton product flags with sixteen cartons left and a
72-per-carton one with barely one, when the big pack runs out of sellable
cartons first. **Ten cartons is a figure I chose, not one anybody asked for.**
It is one exported constant in one place.

**A blank sinks in both sort directions**, as blanks do everywhere in the
portal since Phase 35 — an uncounted product is not a product with none, and
sorting it as 0 would fill the low end (the end somebody sorts to when they
want to know what is running out) with rows that say nothing.

**Nothing on the shop reads the column**, and a test enforces it rather than a
comment: `shop-stock-leak.test.ts` reads the selects the catalogue, the
variant list, the related-products rail and the shop home actually send to
Prisma, plus the cart's two exported priced-product selects, and refuses
`stockPieces` anywhere inside them at any depth. It asserts absence rather
than pinning each select by equality, so it does not break on unrelated
columns a later phase adds.

**The `/products` "Needs attention" total now counts low stock**, beside
missing image, unpublished and not sold — decided without asking, because a
shelf running out is the most actionable thing on that tile. It sits before
"not sold 60d" in the breakdown and on the grid card's corner pill for the
same reason: running out is this week's problem, nothing ordered in two months
is this quarter's.

## Verified, with the figures

**No browser drive of the running app, for the same reason as the previous
phase:** `src/lib/prisma.ts` connects through `PrismaNeon`, which speaks the
Neon serverless WebSocket protocol, and this container has no Neon endpoint —
so no screen could be signed into and no form submitted. What was measured
instead:

- **The migration, applied for real.** A throwaway Postgres 16 cluster took all
  **26 migrations** including this one, `prisma migrate status` then read
  **"Database schema is up to date!"** — so the hand-written SQL and the schema
  agree, which is the thing a generated migration would have guaranteed.
  `\d+ "Product"` reads `stockPieces | integer | nullable | no default`, and a
  row inserted at 0 and one at NULL read back **0 / uncounted false** and
  **NULL / uncounted true**. The cluster was stopped and deleted.
- **Written by hand on purpose.** `prisma migrate dev` would have folded in the
  `PurchaseOrder_documentId_fkey` drift carried since Phase 16 — a separate
  decision about what deleting a document does, recorded in Phase 41's notes.
- **The list column and the cards, in headless Chromium against the production
  stylesheet** from `npm run build`: headers read
  `… List price · Stock↑ · Drift · 12m …`, and the four fixture rows printed
  **1,284,000** in ink `rgb(41, 45, 52)`, **54** and **0** in brand-amber
  `rgb(253, 154, 70)`, and **—** in ink-tertiary `rgb(111, 111, 111)`. The two
  amber rows also read **"1 to fix"** in the Status column, which is the same
  flag counted once.
- **The grid card**, which matters because grid is the default view: a
  **"Low stock"** corner pill in the same amber on the two flagged products and
  none on the others, and the footer strip reading
  `1,200 sold · 6 buyers · RM 24,500.50 · stock 54` — with the stock clause
  **absent entirely** on the uncounted product rather than printed as a dash.
- **No overflow** at 390, 768 and 1440 — `scrollWidth === innerWidth` on all
  three, with the card grid two-up at 165px a card on a phone.
- **Every new guard was watched failing first**, against the plausible wrong
  implementation rather than against nothing:
  - `stockPieces: true` added to the shop catalogue's select — the leak test
    failed on `keysOf(select) not.toContain("stockPieces")`;
  - the sort rewritten as `stockPieces ?? 0` — two sort tests failed, the
    uncounted product landing first;
  - the flag rewritten as `(stockPieces ?? 0) < …` — two flag tests failed,
    an uncounted product reading as empty.
- **A break nothing but running the tests would have caught.** `stockPieces` is
  nullable-never-optional, per this project's rule, and `safeParse` takes
  `unknown` — so the twelve existing `productSchema` fixtures compiled fine and
  failed at runtime until the key was added. `tsc` found the twenty-odd typed
  fixtures; only the suite found those twelve.
- **1299/1299 tests across 100 files** (14 new), `tsc --noEmit`, lint (the same
  2 pre-existing warnings, in files this change never touched) and
  `npm run build` clean. The 101st file, `catalog-import.test.ts`, fails to
  import because `xlsx` is not installed in this container and its CDN is
  blocked — confirmed on the unmodified tree, so it is the environment.

## Not verified

- **Anything on production, and the migration has not run there.** It is
  additive and nullable, so it cannot fail on existing rows, and `vercel.json`
  has run `migrate deploy` on production builds only since 2026-09-17.
- **A figure entered through either form, in a browser.** The edit drawer's
  field, the create form's per-variant column and the single-variant field were
  not typed into: the write paths are covered by the actions' own tests
  (including that three rows write **240 / null / 0** and not one shared
  figure) and the schema by its own, but no submit was driven.
- **The detail page's Stock row, laid out.** It is one more cell in a `dl` that
  already carries nine, and the page needs a database to render.
- **The chip and the tile, clicked.** `low-stock` is in `ProductToolbar`'s
  chips, the page's own `FILTERS` allow-list (the two are separate lists, and
  a chip missing from the second is the Phase 11 defect) and the tile's
  breakdown, and the filter is unit-tested — but no URL was exercised.
- **Ten cartons as the right threshold.** Nobody has said what "low" means for
  this business.
- **The customer's own STOCK column.** Their inventory sheet carries one, and
  `catalog-import.ts` still ignores it, as it has since the catalogue was
  imported. Importing figures rather than typing them was not asked for.
- **The seed.** `prisma/seed.ts` writes no stock, so a fresh development
  database has 308 products reading `—` and no low-stock flags anywhere.

## Previous phase

**An activity says the role, not just the name**


## Status

**Built on `claude/session-cloud-location-aszckl`** (2026-09-20). Asked for as:
"For any activity recorded with a user avatar, show their role too".

**Every activity row that carries a person's avatar now carries their job
beside their name**, in `roleLabel`'s one spelling — Super admin, Production
planner, QC, Warehouse, Member, Buyer contact — read from the actor's own
`User` row. Three surfaces:

- **The purchase order's Notes and activity feed.** Each row's meta line went
  from `Aisha Rahman · 18 Sep 2026, 09:37` to
  `Aisha Rahman · Super admin · 18 Sep 2026, 09:37`. The role sits between the
  name and the clock because it belongs to the name.
- **"Moved here by" in the Status card**, the latest stage event, through the
  same chip.
- **The buyer's Activity timeline** on `/admin/buyers/[id]`, where the role is
  the thing the avatar could never say: that list mixes the buyer's own
  contacts signing in and ordering with ops staff confirming, editing and
  advancing, and until now both sides read as a name and a monogram.

**The role is the `Role` enum, carried to the component, not a string composed
in the query.** `PersonChip` gained a `role` prop that spells it through
`roleLabel`, so this timeline, the user roster and the permission grid cannot
drift on the wording; `ActivityEntry.actor` and `PoActivityEvent`/
`LifecycleItem` gained the enum. It deliberately breaks the
"the query composes the wording" rule that `ActivityEntry.text` follows — a
role is a value with one canonical label, not a sentence.

**Read off the actor's own row, never inferred from the move.** A super admin
may make any stage move (Phase 48 short-circuits `can()` for them), so the
role that *owns* a stage is no evidence of who actually advanced it. Five
selects gained `role: true` — the two `AuditEvent` actor reads, `WebOrder
.placedBy`, `PurchaseOrder.confirmedBy` and `PoStageEvent.changedBy` — plus
`confirmedBy` and `changedBy` on the purchase-order detail page. No migration:
`User.role` has been there since Phase 01.

**System prints no role.** It is not a person and holds no job, so the chip and
the meta line show the name alone rather than an empty separator; a row with no
actor at all — a failed sign-in, which is an email address and nothing more —
is untouched.

**Left alone, on purpose:** the purchase-order table's *Uploaded by* and
*Confirmed by* columns and the buyer's contacts card, which are a table and a
roster rather than records of an action; the *Confirmed by* row in the PO
summary, whose person is named with their role one card below in the feed; and
the shop-order pane's "placed by", where every person is the buyer's own
contact by construction and their email is already beside them.

## Verified, with the figures

**No browser drive, and the reason matters:** this container has no Neon
endpoint. A local Postgres 16 cluster took the 22 migrations cleanly, but
`src/lib/prisma.ts` connects through `PrismaNeon`, which speaks the Neon
serverless WebSocket protocol rather than plain TCP, so the app itself could not
be signed into. The cluster was stopped and deleted. What follows was measured
instead on the **real components, rendered through `renderToStaticMarkup` and
laid out in headless Chromium against the production stylesheet** from
`npm run build` — the same markup and CSS the app serves.

- **The feed's meta lines, read off the rendered page:**
  `Chris Lam · QC · 18 Sep 2026, 09:37`,
  `Nurul Izzati Binti Abdullah · Production planner · 18 Sep 2026, 09:37`,
  `Aisha Rahman · Super admin · 18 Sep 2026, 09:37` and, for the confirm row,
  `Aisha Rahman · Super admin · 1 Sep 2026, 10:00`.
- **System's row reads `System · 18 Sep 2026, 09:37`** — one separator, and
  the word "undefined" appears **nowhere** in the markup.
- **The timeline tells the two sides apart:** `Siti Nurhaliza` / **Buyer
  contact** beside `Aisha Rahman` / **Super admin** and
  `Nurul Izzati Binti Abdullah` / **Production planner**, with the failed
  sign-in row carrying neither avatar nor role.
- **No overflow** at 390, 768 and 1440 — `scrollWidth === innerWidth` on all
  three — and the feed does not scroll sideways inside a 352px rail
  (262 = 262). The longest meta line wraps inside the column's 226px rather
  than pushing it.
- **A measured cost, recorded rather than hidden.** In the timeline's chip the
  role is `shrink-0` and the name `truncate`, so at 390 a 27-character name
  clips to **160px of its 176px** where it did not before; the full value is
  in `title`, which is 00-master §4's truncation-recovery rule. The row is
  *shorter* for it (96px against 128px), because without the role the name
  takes the full width and pushes the sentence onto another line. Names up to
  ~20 characters do not clip at any width, and nothing clips at 768 or above.
- **Three of the five new tests were watched failing first**, with the role
  removed from `PersonChip` and from the feed's meta line: `expected … to
  contain 'Chris Lam · QC · 18 Sep 2026'`, `… 'Chris Lam · Super admin ·'` and
  `… 'Buyer contact'`. The two that assert *absence* — System's row, and a row
  with no actor — correctly still passed, which is what they are for.
- **1286/1286 tests across 98 files** (5 new), `tsc --noEmit`, lint (the same
  2 pre-existing warnings, in files this change never touched) and
  `npm run build` clean. The 99th file, `catalog-import.test.ts`, fails to
  import in this container because `xlsx` is not installed and its CDN is
  blocked — confirmed on the unmodified tree too, so it is the environment and
  not this change.
- **Type flow, not just rendering:** `tsc` found all three test fixtures that
  had to learn the new field, which is the evidence that no call site was left
  guessing a role.

## Not verified

- **Anything on production**, and no production or development database was
  read or written. `User.role` needs no migration, but the roles on real rows
  are what the portal will print — worth a look at `/purchase-orders/[id]` on
  the first deploy rather than trusting the seeded names above.
- **A real signed-in journey.** No screen was opened in the running app, for
  the Neon reason above; the components were measured, the pages they sit on
  were not. In particular the **"Moved here by" caption** was not laid out —
  it is the same `PersonChip`, inside a wrapping caption paragraph, and its
  role adds text that wraps like the rest of that line.
- **The four ops roles on real events.** Every figure above comes from a
  fixture actor. Development's own history only ever carries Aisha (super
  admin) and Chris Lam, so `Production planner`, `QC` and `Warehouse` have
  been read out of `roleLabel` rather than off a stored row.
- **A member's view.** The feed is the same for every staff role and was
  rendered without a session at all; `/admin/buyers/[id]` stays super-admin
  only.
- **Web fonts.** The measurement page loads the production CSS from `file://`,
  so Plus Jakarta Sans and Inter fell back to the system serif; widths above
  are therefore indicative of wrapping, not exact to the deployed typeface.

## Previous phase

**The PO number is required, names the emails, and tax is gone**


## Status

**Built and driven in a browser on `feature/po-number-required-and-no-tax`**
(2026-09-20). Asked for as: "for PO number, it's no longer optional, buyer must
include it"; "For the email content, please replace the order id with PO
number"; "When admin confirming the order, remove the tax section, no need
tax".

**The PO number is required at checkout.** `submitOrderSchema` went from
`.nullable().optional()` to `.trim().min(1)`, so whitespace alone is refused
rather than stored, and `submitWebOrder` lost its `= {}` default — with the
field required, a default empty object would let a caller send an order
carrying none. The form drops "(optional)" and the "leave it blank" hint, and
on Confirm with the field empty it shows "Enter your PO number." in place of
the hint, sets `aria-invalid`, focuses the field and sends **nothing**. Same
shape as the ops confirm form's own required-field gate.

**No migration.** `WebOrder.buyerReference` stays nullable: a DRAFT cart exists
long before this form is reached, and every order placed while the field was
optional still holds null. Those orders keep their `—` everywhere downstream.

**The emails name the buyer's PO number**, where they named our Order ID
before. `PoMetaLine` reads `PO number ACME-PO-771`, and the four templates'
headings and subject lines follow through `emailOrderName` in
`src/lib/order-identity.ts`. Decisions the user made:

- **Body and subject, not the attachment filenames.** The PDF and preview PNG
  are still `W-….pdf` — a typed PO number can carry a slash or a space, which
  breaks a filename, and the Order ID is unique by construction where a buyer's
  own number is not.
- **The summary's "PO number" row stays**, so the value is printed twice, a few
  lines apart. Offered the swap to Order ID and the deletion; chose to keep it.
- **A dash for an order with no PO number**, rather than borrowing the Order ID
  — which is the confusion the 2026-09-17 split exists to remove.

Decided without asking, and flagged before building: **the subject and heading
fall back to the Order ID** where the meta line shows its dash. "We have your
order —" is unusable in an inbox, and those orders are still emailed about
whenever their delivery date moves.

**Tax is gone from both review screens**, at the user's choice when offered
shop-only. The two `Field`s are deleted, the drafts keep `tax: "0.00"`, and
`PurchaseOrder.tax` — still `NOT NULL` — keeps receiving zero. The scan review
also stopped *reading* the extracted tax (`run.ts` now seeds the draft with
`"0.00"`): left as it was, a value nobody could see or correct would still have
been written. `extraction.tax` is still captured, so nothing is lost if this is
reversed. The PO detail page's Tax row, the one place that printed
`Tax MYR 0.00` unconditionally, is now conditional on a non-zero tax — the rule
the document, the PDF and the emails have always followed.

**The consequence, stated rather than buried:** a scanned purchase order that
prints SST now disagrees with its own subtotal, so the totals banner opens and
the reviewer confirms with the mismatch acknowledged, which records an audit
note. That is the existing path for a document whose figures do not add up, not
a new dead end — but every such scan will need that acknowledgement.

## Verified, with the figures

Development, port 3000, as a throwaway `CLIENT` against Kelana Steel and as the
seeded super admin. **Read before changing anything: 0 of 400 purchase orders
carry a non-zero tax**, so the tax change costs nothing on existing data and
the new conditional row never renders in development.

- **The gate sends nothing.** With `fetch` instrumented, Confirm on an empty PO
  number produced **0 requests**, the error "Enter your PO number." with
  `role="alert"`, `aria-invalid="true"`, `aria-describedby` wired to it, the
  field focused, and the URL still `/checkout/review`. **Whitespace alone
  (`"   "`) was refused the same way** — 0 requests again. Filling it cleared
  the message and put the value on the live document preview within 300ms.
- **Stored trimmed.** Sent as `"  KS-PO-9001  "`, read back from the database as
  exactly `"KS-PO-9001"`, status `SUBMITTED`, subtotal `472.50` (3 cartons ×
  RM 157.50).
- **Both real email subjects, off the live send path** (Resend rejected the
  `@example.com` recipient, as recorded since Phase 25, but the subject is
  composed by the real code): **"We have your order KS-PO-9001"** and, after
  confirm, **"Order KS-PO-9001 confirmed · delivery expected 2 Oct 2026"**.
- **The confirm form has no Tax.** Its editable labels are **Expected delivery**
  and **Payment terms** only; `getElementById("tax")` is **null** and the word
  "Tax" appears **nowhere on the page**. Order ID `W-2609-00051` and PO number
  `KS-PO-9001` read in their own separate read-only fields.
- **The scan review has no Tax either.** `/review/[id]` reads **Subtotal** and
  **Total on the document**, and its block re-laid from three columns to
  **438px + 438px** — two even columns, no empty cell.
- **What confirm wrote:** `poNumber` **null** (the Order ID is still never
  copied in), `buyerReference` `KS-PO-9001`, **`tax 0.00`**, subtotal `472.50` =
  total `472.50`. The PO detail page's totals read **Subtotal → Total** with no
  Tax row, and "Tax" appears nowhere on it.
- **Phone.** At 390 the error state shows red under a red-bordered input, the
  input measures **44px** tall, and `scrollWidth === innerWidth` (390/390);
  768/768 and 1440/1440 clean too. The preview above it reads Subtotal → Total
  with no Tax row.
- **Two guards watched failing first.** Reverting the schema to optional made
  all three refusal tests fail with `{ success: true }` — an order with no PO
  number sailing through. Changing `emailOrderName`'s `||` to `??` made the
  empty-string and whitespace cases fail, which is exactly the bug that would
  put a blank in a subject line.
- **Cleanup by id:** two web orders and their lines, one purchase order with its
  line items and stage events, one `Document`, its R2 object (re-checked:
  **NotFound**), the client, one login attempt and one audit row. Counts back to
  users **2**, `CLIENT` **0**, web orders **0**, POs **400**, buyers **11**,
  documents **406**, line items **1606**, stage events **2323**, non-zero-tax
  POs **0**. Five temporary scripts and the screenshot were deleted; `git
  status` carries only this change's 20 files.
- **1298/1298 tests across 97 files**, `tsc`, lint (the same 2 pre-existing
  warnings in files this branch never touched) and `npm run build` clean.

## Not verified

- **Anything on production.** Not deployed, and no production row was read or
  written. **Production may hold purchase orders with a real tax figure** — the
  read above was development only. Those keep their stored tax and still show
  the Tax row, which is why it was made conditional rather than deleted; worth
  a read there before the deploy.
- **A scanned PO that prints SST, driven.** The mismatch-and-acknowledge path is
  argued from `checkTotals` and its existing tests, not watched on a real
  document — every seeded document 404s from R2 (the `seed/*.pdf` keys were
  never uploaded), so no scan could be re-extracted.
- **The emails as they arrive.** Both subjects were read off the live send path;
  no inbox was opened, and the rendered bodies are covered by
  `po-email.test.tsx` rather than by a mail client.
- **The staff notification's subject, live.** Only the buyer's two errored into
  the log; the team's went to a non-test domain and was not echoed. Its wording
  rests on `webOrderPlacedSubject`'s own test.
- **The declined email**, whose subject and heading changed with the other
  three. Unit tests only — no order was declined.
- **A buyer reusing the same PO number.** Nothing enforces uniqueness, and
  nothing did before: `@@unique([buyerId, poNumber, revision])` is deliberately
  not the column a shop order's PO lands in.

## Previous phase

**The account menu says who you are**

**Built and driven in a browser on `feature/account-menu-identity`**
(2026-09-19). Asked for as: "for the avatar on the bottom left, make it same
style as claude, attachment included. Need to show email, role, settings,
logout and etc."

The sidebar's account menu carried three bare text rows — Admin, Settings,
Sign out — and named nobody. It now opens with the signed-in person's **email**
and **role** as a two-line header, then icon rows, Sign out last, matching the
Claude menu in the attachment.

Decisions the user made (all three taken as recommended):

- **Role on its own header line under the email**, not as a badge on the
  sidebar chip. On the chip it would vanish the moment the rail collapses to
  icons; in the header it is always there, and neither line is clickable
  because neither is an action.
- **Admin stays super-admin-only**, unchanged. It hides a link, never a
  permission — the `(admin)` layout redirects and `src/proxy.ts` rewrites to a
  404 regardless.
- **lucide icons** on every row, which is what the shop's own account menu
  already does, so the two menus finally match.

Decided without asking: **"Sign out", not the attachment's "Log out"** — it
pairs with the Sign in it undoes, and the shop says the same. **The role is
read from the `User` row, not the session token.** That is the load-bearing
change: `isSuperAdmin` used to come from the JWT, which is up to five minutes
stale, so a menu could have labelled someone Member while still offering them
the Admin row. Both now come from the same row, falling back to the token if
the read returns nothing.

**A deviation from the canvas**, recorded rather than hidden: there is no
artboard for this menu, and `CLAUDE.md` makes the canvas the source of truth
for visuals. The layout follows the attachment and the design system's tokens;
the canvas is behind the code until someone draws it.

## Verified, with the figures

Development, port 3000, as the seeded super admin.

- **The menu reads** `aisha@lovinghandsportal.com` / `Super admin`, then
  **Admin · Settings · Sign out** with **3 SVGs**, one per row.
- **The staleness fix was watched working.** Aisha demoted to `MEMBER`
  directly in the database with **no re-sign-in**, so the session token still
  said `SUPER_ADMIN`: the header re-read **"Member"** and the Admin row was
  **absent (0 matches)**. Under the old code it would have kept offering Admin
  for up to five minutes. Restored to `SUPER_ADMIN` afterwards and **read
  back**, both users confirmed.
- **A defect found by measuring, pre-existing and fixed here.** The rows were
  **28px** tall at 390 — under this project's 44px phone floor since the
  2026-09-06 mobile pass. All three now measure **44px** at both 390 and 1440.
  The height is applied on this menu, *not* on the shared `DropdownMenuItem`
  primitive, which every other dropdown in the portal uses for desktop sort
  and row-action menus.
- **And a second one:** at 390 the menu's right edge sat at exactly **390** —
  flush against the screen. `collisionPadding={12}` moves it to **378**.
- **No overflow** at 390 or 1440, menu open or closed.
- **1285/1285 tests across 97 files**, `tsc`, lint (the same 2 pre-existing
  warnings) and `npm run build` clean.

## Not verified

- **Anything on production.** Not deployed.
- **A real member's own session.** The member case was driven by demoting a
  super admin in the database, not by signing in as a seeded member.
- **The four other ops roles' labels** (Production planner, QC, Warehouse).
  They come from `roleLabel()`, which the permission grid already renders, and
  only `Super admin` and `Member` were seen in the menu.
- **An email long enough to truncate.** The header carries `truncate` and a
  `title`, unexercised — the only two addresses in development are short.

## Previous phase

**The supplier record removed — built, driven in a browser and merged to
`main` as `886aaf1`** on `feature/remove-supplier-info`
(2026-09-18). Asked for as: "please remove all supplier info. There shouldn't
have any supplier in the first place. We are the supplier."

The premise of Phase 24 was wrong. `OrgSettings` held four fields — supplier
name, email, phone, address — describing a company that does not exist
separately from us, and five surfaces read them: the purchase-order document's
**Supplier** party block (which only ever repeated the masthead), the `/admin`
**Contact details** card, the shop footer's **Contact** column, the account
menu's **"Talk to our team"** mailto, and the review screen's **"Ask us to
change this"** button. All five are gone, with the table, the four
`ZEN_GARDEN_*` fallbacks and the `org.settings` permission.

Decisions the user made (all three taken as recommended):

- **Everything, the storefront contact included.** Not "keep the footer on a
  hardcoded constant": the fields were empty in both databases, so the footer's
  Contact column and the mailto were already rendering nothing. Keeping a
  surface that shows nothing is worse than not having it.
- **Buyer alone, half width.** The party row keeps its two-column grid and the
  buyer keeps the line length it was designed for, rather than an address
  running the full 1070px of a landscape sheet. In the PDF that needed
  `width: "50%"` in place of `flexGrow: 1` — one child of a flex row grows to
  fill it.
- **Drop the table.** A migration, `20260922090000_drop_org_settings`, rather
  than a dead table left in the schema.

Decided without asking: the migration also **deletes the five orphaned
`PermissionGrant` rows** for `org.settings` — `action` is a plain String with
no foreign key, so they would have sat unread for ever. `DOCUMENT_COMPANY_NAME`
stays and is now the document's **only** naming of us. `optionalEmail` in
`src/lib/validation/common.ts` is left in place though it now has no caller: it
is a generic helper, and deleting it is beyond what was asked.

**What is lost: nothing that was displaying.** Both databases held **zero**
`OrgSettings` rows and production has **none** of the four `ZEN_GARDEN_*`
variables set, so every one of those five surfaces was already blank or
printing only the fallback company name.

## Verified, with the figures

Development, port 3000, as the seeded super admin and a throwaway `CLIENT`
against Kelana Steel. **The dev server was restarted first**, because the one
running predated `prisma generate`.

- **Read before dropping, both databases.** `OrgSettings` **0 rows on
  development and 0 on production** (production read through
  `vercel env pull --environment=production`, a read-only query, credentials
  deleted straight after); `org.settings` grants **5 of 100** on each. After
  the migration on development: the table is **gone** from
  `information_schema`, `org.settings` grants **0**, total grants **100 → 95**.
- **The PDF, through the real renderer.** 4,099 bytes, one landscape A4 page:
  masthead `ZEN GARDEN TRADING (M) SDN BHD`, then `BUYER` alone, and
  **`pdftotext | grep -ci supplier` returns 0**. Rendered again with a
  120-character single-line address to measure the block rather than assume it:
  it wrapped at **x = 383.9 on an 841.89pt page**, against a half-width
  boundary of ~396 — half, not stretched.
- **The on-screen document, live on `/checkout/review`.** Sheet 1070px, party
  grid **475px + 475px** with one child at **475px**; masthead reads
  `ZEN GARDEN TRADING (M) SDN BHD`; `/supplier/i` matches **0 times** in the
  sheet and 0 times in `main`; **"Ask us to change this" is absent**.
- **The account menu** reads My orders / Change password / Sign out, hrefs
  `/orders` and `/account/password` — **no "Talk to our team" and no
  `mailto:`**.
- **The footer is three columns**, `354.664px × 3` at 1440 and one column at
  390, headings the strapline / Shop / Your account, and **no "Contact"**.
- **`/admin`** carries no Contact details card and no "Supplier" anywhere; the
  permission grid reads **19 actions**, with Administration down to **Manage
  users** and **Manage permissions**.
- **No overflow** on `/checkout/review` and the shop home at 390 / 768 / 1440 —
  six combinations, `scrollWidth === innerWidth` on all.
- **Cleanup by id:** the throwaway client, its `DRAFT` cart `W-2609-00050` and
  its line, one login attempt and one audit row; counts back to users **2**,
  `CLIENT` **0**, web orders **0**, web order lines **0**, buyers **11**, POs
  **400**. Three temporary scripts and the temporary render test were deleted;
  `git status` carries only this change.
- **1285/1285 tests across 97 files**, `tsc`, lint (the same 2 pre-existing
  warnings) and `npm run build` clean — re-run on the rebased tree. The browser
  work above was driven on a tree that also carried the unmerged Phase 49
  (stage coverage), because this branch was cut from it; **only this one commit
  was taken to `main`**, rebased onto it, and the three conflicts that caused
  (`/admin`'s query tuple, the `User` relation list, this file) were resolved
  by hand. What that changes about the measurements: `/admin` here has no Stage
  coverage section, and the permission grid's **19 actions** and two-row
  Administration group are the same either way.

## Not verified

- **Anything on production.** Not deployed. Production was **read** (0
  `OrgSettings` rows, 5 `org.settings` grants) and not written; the migration
  has not run there. Per the note carried since 2026-09-17, only production
  builds migrate, so the table drops on the `main` deploy and not on a preview.
- **A stored PDF drawn before today.** Files already in R2 keep their Supplier
  block until their order is confirmed or its delivery date moves, which is
  Phase 42's redraw rule and unchanged here.
- **The five emails**, whose PO preview image is rasterised from the same
  renderer. Unit tests cover the data; none was sent or rendered to a client.
- **A member's view** — `/admin` was read as a super admin.

## Previous phase

**Phase 48 — built and driven in a browser on `feature/role-based-access`**
(2026-09-18). Spec `docs/specs/48-role-based-access.md`. Asked for as: four
roles; each ops role owns only the status moves that belong to their job;
everything else view-only or hidden; a super admin user-management screen with
a configurable permission matrix stored in the database, not hardcoded in the
UI; enforced on the server, not by hiding buttons.

Decisions the user made (one round of questions):

- **`MEMBER` stays, as a fifth view-only role.** Retiring it would mean
  guessing each existing member's job. It keeps its rows and becomes
  see-everything-change-nothing, which also makes the `AUTO_APPROVE_DOMAIN`
  Google path admit people at the least privileged role rather than one that
  can confirm purchase orders.
- **All four working roles may upload a PO; only a super admin reviews and
  confirms it.** The brief's matrix did not cover the intake path, which is
  plain `requireUser()` today.
- **The grid is a section on the user-management page**, `/admin`, below the
  users table — not its own route.
- **A cell is a checkbox, not a level.** Full/View collapses into
  granted/not-granted with viewing and managing as separate keys
  (`product.view` / `product.manage`), so the server check is one boolean
  lookup with no `FULL ⊇ VIEW ⊇ ADVANCE` ordering to get wrong. The user was
  shown both models rendered against the real matrix before choosing. The
  first column carries a descriptive label with a one-line subtext, at their
  request.

Decided without asking: **everything under `/admin` stays super-admin-only
structurally**, so the three Administration rows render locked — `src/proxy.ts`
imports no Prisma and cannot consult the grid, and the alternative loses the
pinned 404 status. **Leaving a note on an advance is not a separate key**; it
rides on the advance grant. `can()` short-circuits `SUPER_ADMIN` to true
*without reading the table*, so no saved edit or corrupt row can lock the
administrators out.

**Narrowing on deploy**, and the team needs telling: confirm/decline, editing
a PO header, editing a buyer and the review screen all become super-admin
only, and advancing becomes stage-scoped. Nobody's access widens.

## Verified, with the figures

Development, port 3000, with four throwaway users — one per working role and a
`MEMBER` — signing in for real. Full report in
`docs/specs/48-role-based-access.md` §13.

- **All twenty stage cells match the brief's table**, read from the server
  with each role's own session against one real order at each of the five
  advanceable stages. Planner true only on Order placed, QC only on In
  production, Warehouse on the last three, Member on none.
- **The server refuses, not just the button.** A planner calling
  `advanceStage` on a QC-passed order through a temporary route holding their
  real session got "Warehouse advances this stage." with the stage unchanged;
  the warehouse role on the same order moved it.
- **A grid change is live with no deploy and no restart** — false → true →
  false across three consecutive requests with the dev server untouched. A
  save from the browser grid wrote both cells, one `PERMISSIONS_CHANGED` audit
  row (`buyerId` null, keys and booleans only), and took effect on the next
  request for the affected sessions.
- **`/admin` answers 404** for all four roles. No role sees Edit, Delete or
  Move back; the planner's Advance renders disabled with the caption
  "Warehouse advances this stage.", the warehouse role's renders live.
- **Grid:** 20 rows in 6 groups × 5 columns, all super-admin cells checked and
  disabled, all three Administration rows disabled, Save disabled at rest.
  No overflow at 390 / 768 / 1440; at 390 it is a role picker with 0 targets
  under 44px.
- **Cleanup by id:** four users, four login attempts, two audit rows, one
  stage event; every grant reset to default with `updatedById` cleared. Counts
  back to users 2, grants 100, POs 400, stage events 2323, audits 5, login
  attempts 68.
- **1304/1304 tests across 100 files**, `tsc`, lint (same 2 warnings) and
  `npm run build` clean. Every guard was watched failing first.

## Not verified

- **Anything on production.**
- **The status code on `/upload` and `/review/[id]`** — both answer 200 with
  the "Page not found" body and none of the screen's content, the app-wide
  streaming-layout gap recorded on 2026-09-10. `/admin` keeps a real 404
  because the proxy pins it. Content is right; only the status is wrong.
- **A Google access request approved into one of the new roles**, two super
  admins saving the grid at once, and the phone grid's save path.

## Previous phase

**Phase 47 — built and driven in a browser on
`feature/po-delivery-column-and-motion`, not yet committed** (2026-09-17). Asked for
as: "In the PO table, add one more column named Expected Delivery date. Add
some subtle animation for the ribbon number to get admin attention. Add more
animation to the button and the pages. I have a success.lottie animation file,
I want to replace the checkmark when user placed an order at shops, where
should I put the file? In the PO confirmation page, from the what the buyer
sent, just show original PO with preview function."

Decisions the user made (one round of questions):

- **Ribbon: soft ping + pop.** A faint ink ring fades outward from the review
  count every 3s (`count-ping`, resting for 60% of the cycle) in the sidebar
  and on the phone's Orders tab; the pill pops when its number changes
  (`count-pop`, keyed by the count). The queue heading's pill only pops.
  Both are off under reduced motion.
- **Motion: press + page entrance.** `Button` scales to 97% on press
  (replacing the 1px drop), and the ink and gradient pills lift 1px with
  `shadow-xs` on hover. Six hand-styled shop CTA links get the same through a
  new `pressable` utility. Every portal and shop page's top-level blocks rise
  in 30ms apart (`page-enter`, the existing `rise`), keyed by pathname in
  `PageTransition` — a sort, chip or page of the table does not replay it.
- **Shop order review: PDF with the summary below.** The left pane of
  `/web-orders/[id]` leads with the order's generated purchase-order PDF in
  `DocumentPreview` (paging, zoom, download), and keeps the lines and buyer's
  total under it; an order with no PDF shows the summary alone.

Decided without asking: the column reads **Expected delivery** (sentence case,
per 00-master §4), sits after PO date, sorts soonest first by default with
undated rows last, and is hidden in the review queue, where every row is
undated. The success animation lives at **`public/animations/success.lottie`**
and plays once through `@lottiefiles/dotlottie-react` (new dependency) in
`SuccessMark`; the old checkmark stays as the fallback under reduced motion or
a failed load. **The proxy matcher now skips `.lottie`**: without it the shop
host rewrote the path under `/shop` and answered 404.

## Verified, with the figures

Development, port 3000, as Aisha, with a fixture shop order `W-2609-09970`
(two lines, PDF drawn through the real `attachWebOrderDocument`, 4,280 bytes,
no email) under a throwaway `CLIENT`.

- **Column:** main table headers PO number, Buyer, PO date, Expected delivery,
  Items…; `PO-2026-0025` read 4 Sep 2026 / 16 Sep 2026; the queue's headers
  have no Expected delivery. Sorting it gave `?sort=deliveryDate&dir=asc` with
  23, 24, 26, 26, 27 Sep 2025 first.
- **Ribbon:** the sidebar pill "4" computed `count-pop` and a ring with
  `count-ping` at 3s; the link's name still "Purchase Orders, 4 need review";
  the phone tab's pill at 791 inside the tab's 788 top, as in Phase 46.
- **Page entrance:** counted remounts of `.page-enter` — 0 after a sort, 0
  after the Confirmed chip, 1 after clicking Buyers, whose first block
  computed `rise` 0.32s.
- **Buttons:** hovering Confirm order computed `translate: 0px -1px` and the
  indigo `rgba(18, 43, 165, 0.08) 0 4px 12px` shadow. The press rule is
  compiled and applied — with transitions off the pressed button computes
  `scale: 0.97` — but headless Chrome did not advance the 150ms transition
  while sampled, so the press itself was not watched moving.
- **PDF pane:** the landscape page rendered in the left pane (472×333 at
  1440, 274 wide at 390, 644 at 768), text reading ZEN GARDEN TRADING (M) SDN
  BHD … FIX-333 … Expected Delivery —; 0 console errors on reload.
- **Success mark, fallback path:** signed in as the fixture client on
  `shop.localhost`, `/checkout/sent/W-2609-09970` requested
  `/animations/success.lottie` (404, no file yet) and the player's wasm from
  jsdelivr (200); the canvas went away and the checkmark showed.
- **The matcher, both ways:** a throwaway `probe.lottie` answered 404 on the
  shop host with the old matcher and 200 with the new one (200 on the portal
  host too); the probe was deleted.
- **No overflow** on `/purchase-orders`, `/web-orders/[id]` and the sent page
  at 390, 768 and 1440.
- **Cleanup by id:** web order and its lines, `Document`, R2 object
  (`NoSuchKey`), the client, its login attempts and audit rows; counts back to
  users 2, `CLIENT` 0, web orders 0, documents 406, POs 400, login attempts
  68, audits 5. The temporary fixture script was removed.
- **1177/1177 tests** (two new SQL tests for the column), `tsc`, lint (same 2
  warnings) and `npm run build` clean.

## Not verified

- **The real `success.lottie` playing.** The file has not been added; only the
  fallback was driven. Its size on the page (112px) may want tuning to the
  animation.
- **The wasm from a CDN.** The player fetches its WebAssembly from jsdelivr
  (unpkg as backup). A blocked CDN falls back to the checkmark; self-hosting
  it (`setWasmUrl`) was not done.
- **Anything on production**, a member's view, and the storefront's own pages
  beyond the sent page (entrance and CTA motion there rest on the shared
  layout and utility).

## Previous phase

**Phase 46 — built and driven in a browser on
`feature/po-needs-review-section`, merged to `main` and pushed** (2026-09-17). Asked for
as: "in the purchase order table seprate out the section for Needs Review,
make it a section on top of the main table, this require the intention of
admin. Also, at the sidebar, the Purchase Order should add a small ribbon
indicating number of pending need review PO."

Decisions the user made:

- **The section holds everything waiting on the team**: shop orders sent
  (Needs review) or received (Received) but not confirmed, and uploads Claude
  has read (Needs review). Uploads still extracting or failed stay in the
  table.
- **Those rows leave the main table.** Its Needs review and Received chips
  went with them, and "From the shop" now means confirmed shop orders only.
  The `needs-review`, `received` and `shop-open` list filters were removed;
  an old link carrying one falls back to All, with the rows in the section on
  the same page. The dashboard's "Needs you" lines for reviews and shop orders
  link to the section's anchor; failed uploads still filter the table.
- **The section ignores the search and filters** — it is the inbox — and runs
  longest waiting first, by a new `queuedAt` (a shop order's send, an
  upload's arrival). It hides PO date and Confirmed by, blank on every
  queued row, and renders nothing when empty.
- **The count shows beside Purchase Orders in the sidebar and on the phone's
  Orders tab**, from the queue's own summary query, and disappears at zero.
- **The count is a dark pill** (ink, white number), also beside the section
  heading. First built amber; the user asked for the current design, compared
  screenshots of the dark pill and the soft grey `badge-pill`, and chose dark —
  the grey one all but vanished on the selected sidebar row.

**A defect the browser found:** the portal layout is not re-rendered on a
client-side navigation, so with the count drawn only there, a shop order
arriving while someone was on Buyers left the sidebar at 4 beside a section
reading 5 until a reload. The count now lives in `ReviewCountProvider`, seeded
by the layout and re-read from `/api/review-queue/count` (staff only) on every
navigation, on focus and once a minute; the section also writes the number it
drew, so the two agree on the same page. Also found: the badge wrapped
"Purchase Orders" onto two lines in the 240px sidebar, and sat 1px over the
phone tab bar's border — both fixed and re-measured.

## Verified, with the figures

Development, port 3001, as Aisha, with the three uploads development already
holds ready for review and fixture shop orders under a throwaway `CLIENT`.

- **Split:** section "Needs review 5" — three uploads, then W-2609-09962
  (Received) and W-2609-09961 (Needs review), longest waiting first; main
  table 403 rows (400 purchase orders, two extracting, one failed); chips All,
  Confirmed, Extracting, Failed, From the shop; sidebar "Purchase Orders 5",
  accessible name "Purchase Orders, 5 need review".
- **Filters don't touch it:** a search plus the Confirmed chip left the
  section at 5.
- **It follows the work:** receiving W-2609-09961 kept 5; confirming
  W-2609-09962 made the sidebar and the section 4.
- **Arrivals:** before the fix, sidebar 4 against section 5 after a soft
  navigation; after it, a new order inserted while on Buyers read 6 on the next
  sidebar click (Products), and 6 in both places on the list.
- **Phone:** the Orders tab's badge reads 6 inside the tab (791 against its
  788 top); no overflow at 390 and 768. The sidebar label is one line (21px),
  the badge 12px clear of it.
- **Dashboard:** "3 purchase orders need review" and "3 orders from the shop
  to confirm" both link to the section; "1 upload failed to extract" still
  filters the table.
- `GET /api/review-queue/count` as a guest answered 307 to sign-in.
- **Cleanup by id:** four web orders, one purchase order, one `Document`, its
  R2 object (NotFound), the client and one login attempt; counts back to users
  2, `CLIENT` 0, web orders 0, POs 400, documents 406, line items 1606, stage
  events 2323, audits 5, login attempts 68, products 308; extractions unchanged
  (2 running, 400 confirmed, 3 succeeded, 1 failed).
- **1175/1175 tests** (the list-query tests rewritten, and a guard watched
  failing — six tests — with the shop branch put back in the table), `tsc`,
  lint (same 2 warnings) and `npm run build` clean.

## Not verified

- **Anything on production.**
- **A member's view** — the queue and count are the same for every staff
  role, and were read as a super admin.
- **The once-a-minute refresh and the focus refresh** on their own; only the
  navigation refresh was driven.
- **A queue of more than a handful of rows.** It is unpaged by design.

## Previous phase

**Phase 45 — built and driven in a browser on
`feature/po-document-quantity-columns`, merged to `main` and pushed** (2026-09-17). Asked
for as: "Put as subtext … 'Our team will confirm the expected delivery and
payment terms as soon as possible'. For description line item, remove 6
pieces/carton · 60 cartons/pallet · 6 pieces instead, add columns for
pieces/carton, carton/pallet and total pieces and total cartons and total
pallet".

Decisions the user made:

- **Five quantity columns on every line**: Pieces/carton, Cartons/pallet,
  Total pieces, Total cartons (the old Cartons column) and Total pallets. The
  pack text line under the description is gone; a figure the product lacks
  reads "—".
- **Total Pallets is a whole number, rounded up** to the pallets that ship
  (1,200 ÷ 52 → 24; 25 ÷ 60 → 1; an exact 104 ÷ 52 stays 2). First built at
  two decimals; changed after the user read an example PDF.
- **Headings are capitalised word by word** on both renderers — Product Code,
  Pieces/Carton, Cartons/Pallet, Total Pieces, Total Cartons, Total Pallets,
  Unit Price, and the date labels Order Date, Expected Delivery, Payment
  Terms. A deliberate exception to the sentence-case rule in
  `docs/specs/00-master.md` §4, on the document only.
- **Landscape.** The PDF is landscape A4. The on-screen sheet is 1070px wide,
  not A4's 1123: at 1123 the shop's content column (1070px inside the frame)
  scrolled the sheet sideways on a 1440px desktop and hid part of Amount —
  measured 1163 scroll against 1110 client, then 1110 / 1110 after. Print CSS
  asks for A4 landscape.
- **The note sits under the dates only while the order awaits confirmation**
  — a cart, a submitted or a received order — via a new
  `awaitingConfirmation` on `PoDocumentData`, set by each caller. Its wording
  is one constant, `AWAITING_CONFIRMATION_NOTE`, shared by both renderers.

`PoDocumentLine.packCaption` became five fields, and `documentPackCaption`
and `packCaptionFor` were removed for `documentQuantities`. Found in the
browser: "Pieces/carton" and "Cartons/pallet" have no space to wrap on and
ran into each other; each now offers a break after the slash.

## Verified, with the figures

Development, port 3001, fixture `W-2609-09945` (1,200 × `ZEN-SC-1000-GM-MYDIN`
at 12/carton and 52/pallet; 3 × `MRK-DW-1500-LI-X6` at 6/carton, no pallet
figure) under a throwaway `CLIENT`.

- **Buyer's page before confirm:** the note under the dates; line 1 reads
  12 / 52 / 14,400 / 1,200 / 23.08 / 210.00 / 252,000.00 (pallets since
  rounded up — see below), line 2
  6 / — / 18 / 3 / — / 157.50 / 472.50. No page overflow at 390, 768, 1280
  and 1440, and the sheet's frame does not scroll at 1440.
- **Confirmed as Aisha with 2 Oct 2026:** the buyer's page reads 2 Oct 2026
  with no note; the stored PDF (4,297 bytes) is one page of 841.89 × 595.28pt
  and extracts the same ten columns and figures.
- **An unconfirmed PDF** through the real renderer extracts the note and "—"
  in both pallet columns.
- **Cleanup by id:** web order, purchase order, `Document`, R2 object
  (NotFound), client, two login attempts, one audit row; counts back to users
  2, `CLIENT` 0, web orders 0, POs 400, documents 406, line items 1606, stage
  events 2323, audits 5, login attempts 68, products 308.
- **1172/1172 tests, `tsc`, lint (same 2 warnings) and `npm run build` clean.**
- **After the rounding and capitals change:** example PDFs rendered through
  the real renderer extract `Pieces/Carton … Unit Price` and `Order Date /
  Expected Delivery / Payment Terms`, with Total Pallets 3 for 130 cartons at
  60 and 1 for 60; 1172/1172 tests, `tsc` and lint clean again.

## Not verified

- **The capitalised headings on screen.** The change is text only in the same
  cells, but the browser was not reopened after it.
- **Anything on production.** Stored PDFs keep their portrait layout until
  their order is confirmed or its delivery date moves.
- **Printing** through the browser's Print button at landscape.
- **The checkout review preview** in a browser (same component and builder,
  unit-tested), and a scanned purchase order's document on the buyer's page.
- **Confirmed shop orders still number their lines from 0 on the buyer's web
  page** (seen again in this phase's screenshots; the stored PDF numbers from
  1). Pre-existing since Phase 42's notes; the user was asked and has not
  decided whether to fix it.
- **A long product code** still wraps inside its column on the PDF
  (`ZEN-SC-1000-GM-MY-` / `DIN`), as it did before this phase.

## Previous phase

**Phase 44 — built and driven in a browser on `feature/po-document-pack-line`,
merged to `main` and pushed** (2026-09-17). Asked for as: "For the description of the PO
line item. Remove the words Variant and Market. Then show the following in
order pieces/carton then cartons/pallet. Also show expected delivery date as
'-' once the admin confirm the expected delivery date, it will be reflected on
the PO".

- **Caption** reads `Goat's Milk · Mydin`; a missing half is left out.
- **Pack line** reads `12 pieces/carton · 52 cartons/pallet · 14,400 pieces`.
  The user chose to keep the total pieces at the end, and to leave the pallet
  figure out where the product has none (`6 pieces/carton · 18 pieces`).
  "carton" is written out rather than taken from the line's unit, so a scanned
  "Carton" no longer prints capitalised. The pallet figure is read from the
  product at render time; unlike the pack size it is not snapshotted on the
  order line.
- **Expected delivery** is always a cell now, reading `—` until the team
  confirms a date. Phase 42's redraw at confirm already puts the date on the
  stored PDF, so no new write path. Applies to both renderers, including the
  checkout preview.
- `CartLine` and the three buyer/PDF queries carry `cartonsPerPallet`; the
  buyer-order leak guard was widened by that one column on purpose.

## Verified, with the figures

Development, port 3001, fixture `W-2609-09944` (1,200 × `ZEN-SC-1000-GM-MYDIN`
with 52 cartons/pallet, 3 × `MRK-DW-1500-LI-X6` with none and no market) under
a throwaway `CLIENT`.

- **Buyer's page before confirm** (`shop.localhost:3001/orders/{id}`): Expected
  delivery `—`; line 1 `ZEN 1L` / `Goat's Milk · Mydin` / `12 pieces/carton ·
  52 cartons/pallet · 14,400 pieces`; line 2 `MR.KING 1.5L` / `Lime` /
  `6 pieces/carton · 18 pieces`.
- **Confirmed as Aisha** with 2 Oct 2026: the stored PDF (4,165 bytes, read from
  R2 through `pdftotext`) reads Expected delivery `2 Oct 2026` and the same two
  lines; the buyer's page reads `2 Oct 2026`.
- **An unconfirmed PDF** rendered through the real renderer reads Expected
  delivery `—`, so the dash survives the PDF font.
- No overflow on the buyer's order page at 390 and 768.
- **Cleanup by id:** web order, purchase order, `Document`, R2 object
  (NotFound), client, two login attempts and one `SIGNED_IN` audit; counts back
  to users 2, `CLIENT` 0, web orders 0, POs 400, documents 406, line items
  1606, stage events 2323, audits 5, login attempts 68, products 308.
- **1170/1170 tests, `tsc`, lint (same 2 warnings) and `npm run build` clean.**

## Not verified

- **Anything on production.** PDFs already stored keep their old layout until
  their order is confirmed or its delivery date moves (Phase 42's redraw rule).
- **The checkout review preview** was not opened; it draws through the same
  `PurchaseOrderPreview` and `buildPoDocument`, covered by unit tests.
- **A scanned purchase order's document** on the buyer's page, which takes its
  pack size and pallet figure from the matched product.

## Previous phase

**Phase 43 — built and driven in a browser on
`feature/po-list-backlog-and-delete`, merged to `main` and pushed** (2026-09-17). Asked
for as: "When buyer sent a PO through shop, the PO should show up in admin
purchase-orders table even when its not confirm yet. It should marked as Needs
Review. Also, allow admin to delete the PO from purchase-orders table".

**Submitted shop orders were already in the list as Needs review — on its last
page.** An unconfirmed row has no PO date, and the default sort is PO date
descending `NULLS LAST`, so a shop order sent this morning filed behind all 400
confirmed orders. Decisions the user made:

- **Pin the backlog to the top** (not "use the order date"): on a PO-date sort,
  in both directions, `sortStatus` orders first, so shop orders and scan drafts
  lead and the PO date column still reads `—`. Other sorts are untouched.
- **Delete is super admin only**, from a trash icon in the table's last column,
  with the reference typed back. A member keeps only the existing scan-upload
  delete. Dashboard and buyer-page tables stay read-only (`canDeleteOrders`).
- **Deleting an unconfirmed shop order removes it without emailing the buyer**:
  the order, its lines, its generated `Document` and the R2 object
  (`deleteWebOrder`, guarded on SUBMITTED/RECEIVED). The dialog points at
  Decline for when the buyer should know.
- A confirmed purchase order uses the existing `deletePurchaseOrder` through
  `DeletePoDialog`'s new `row` variant; a shop-sourced one says "The buyer's
  order goes back to the queue as Needs review."

**A pre-existing defect found in the browser and fixed:** `deletePurchaseOrder`
deleted the purchase order before resetting its web order. The FK is
`ON DELETE SET NULL`, so the reset's `where: { purchaseOrderId }` matched
nothing and the shop order was left **CONFIRMED pointing at nothing**, in no
chip at all. The reset now runs first, and a test pins the call order (watched
failing before the fix). The mocked unit tests could never see it.

## Verified, with the figures

On the development database, port 3001, as Aisha (super admin), with two
fixture shop orders (`W-2609-09901` / `-09902`) under a throwaway `CLIENT`.

- **Order:** page 1 read the two shop orders first ("Needs review · Shop"),
  then the six scan drafts, then confirmed orders; summary 408.
- **Confirmed delete from the table:** `-09902` received and confirmed (PDF
  stored), then deleted from its row: the button stayed disabled empty and for
  `W-2609-0990`, enabled for ` w-2609-09902 `, the URL stayed on the list. The
  first run (pre-fix) stranded the web order as CONFIRMED with
  `purchaseOrderId null` and the count fell to 407; after the fix the same
  journey held **408** and the row returned as Needs review, `status
  SUBMITTED`, `receivedById null`.
- **Shop-order delete:** disabled for the *other* order's reference; afterwards
  407 rows, Needs review chip 4, and the web order, its lines and its
  `Document` read `null`/0, R2 `HeadObject` **NotFound**.
- **A member** (Aisha demoted, fresh sign-in, restored after) saw no delete on
  shop or confirmed rows and kept "Delete upload" on the six drafts.
- **Sweep:** `/purchase-orders` at 390 / 768 / 1440, `scrollWidth ===
  innerWidth` on all three; the trash icon measures 44×44 at 390, 24×24 above.
- **Cleanup by id:** the fixture web orders, the client and one login attempt;
  counts back to users 2, `CLIENT` 0, web orders 0, POs 400, documents 406,
  line items 1606, stage events 2323, audits 5, login attempts 68, products
  308; Aisha read back `SUPER_ADMIN`.
- **1168/1168 tests, `tsc`, lint (same 2 warnings) and `npm run build` clean.**

## Not verified

- **Anything on production.** Not deployed, and a read of production's shop
  orders was refused by the permission classifier, so production's
  `W-2609-00001` being on its last page is inferred from the code.
- **Deleting a shop order that holds no PDF**, live (unit test only), and the
  R2-failure path (unit test only).
- **Deleting from a PO's own page** after the copy change (same component).

## Notes

- **Any shop order confirmed and later deleted on production before this
  deploys is stranded** as CONFIRMED with no purchase order. Worth a read-only
  query there: `WebOrder` where `status = 'CONFIRMED' AND "purchaseOrderId" IS
  NULL`.
- Within the backlog, rows tie-break on `poNumber` ascending, so shop orders
  (`W-…`) lead scan drafts (`scan-…`), oldest reference first.

## Previous phase

**Phase 42 — the purchase-order file — built and driven in a browser on
`feature/po-document-revamp`, not yet committed** (2026-09-17). Asked for as:
"Rename Zen Garden to ZEN GARDEN TRADING (M) SDN BHD; in the description, show
the variant and market of the product; all numbers must be thousand separated
by ,; remove 'Prepared for the buyer named below', 'Authorized by Buyer' and
'Date'; remove Delivery requested (also from the shop); add Expected delivery
date, only shown after admin confirms it."

Decisions the user made before building:

- **Description:** the bold line is the product name with its own
  " — Variant" suffix taken off (`groupName`), and a caption under it reads
  "Variant: Goat's Milk · Market: Vietnam", then the pack line. A missing
  market is left out; a scanned PO line with no product keeps its printed text
  and no caption.
- **The stored PDF is redrawn** at confirm and whenever the expected delivery
  date moves on the PO edit sheet (cleared included), into the **same
  `Document` row and R2 key**, so the buyer's Download and the ops pane read
  the new bytes. Until Phase 42 it was drawn once at submit and never again, so
  it could never show a date.
- **The confirmation email attaches the redrawn PDF**; so does the
  "delivery date has moved" email (same template). A failed redraw sends the
  email without it and without the "attached" sentence.
- **`WebOrder.requestedDate` is kept, no migration** (preview builds migrate
  production). Nothing writes or shows it: the shop's review form, the submit
  schema, the ops "What the buyer sent" pane, the product page's
  "wants <date>" and the document all dropped it. The confirm form's date field
  now starts empty rather than prefilled.

Decided without asking: **the new name is the document's only** — its
masthead (plain ink text, replacing the gradient wordmark) and the supplier
block's fallback. The shop and portal wordmarks still read "Zen Garden". A
supplier name saved on `/admin` still wins in the supplier block, but not in
the masthead (`DOCUMENT_COMPANY_NAME`).

Numbers are grouped in both renderers through a new `formatGrouped` in
`money.ts` (cartons, unit price, amount, subtotal, tax, total, pack size and
pieces). `PoDocumentData` money stays ungrouped because
`documentAgreesWithOrder` does arithmetic on it. The meta strip is three cells,
four once confirmed; the signature rules are gone from both renderers.

## Verified, with the figures

Driven on the development database with a fixture shop order inserted directly
(`W-2609-04201`, 1,200 + 3 cartons, RM 265,261.50), placed by a throwaway
`CLIENT` at `delivered@resend.dev`, and confirmed in the browser as Aisha
(super admin). The dev server ran on **port 3001**, because another project
held 3000.

- **The ops pane** read no "Delivery requested" row, and the confirm form's
  date field read `""` before anything was typed.
- **Confirm redraws the file.** After confirming with 2 Oct 2026, R2's
  bytes (4,210, the same `Document` id on the web order and the purchase
  order) extracted to: `ZEN GARDEN TRADING (M) SDN BHD`, meta cells Order date /
  **Expected delivery 2 Oct 2026** / Payment terms / Currency, supplier
  `ZEN GARDEN TRADING (M) SDN BHD`, line 1 `2.1L ZEN SIGNATURE` / `Variant:
  Goat's Milk · Market: Super Indo` / `6 per carton · 7,200 pieces` /
  `1,200` / `220.50` / `264,600.00`, total `265,261.50`, footer "Confirmed by
  our team…", and no "Prepared for", "Authorised" or "Date" line.
- **Moving the date redraws it again.** Edit sheet 2 Oct → 9 Oct: the same key
  then read **Expected delivery 9 Oct 2026**, 4,211 bytes.
- **The buyer sees it.** On `shop.localhost:3001/orders/{poId}` the document
  read the same as the file, with 9 Oct 2026. On `/checkout/review` there was
  **no date input** (0 `input[type=date]`), no "requested" anywhere in `main`,
  and the preview carried no Expected delivery cell. `scrollWidth === innerWidth`
  at 390 and 768 on the review page, and at 768 on the order page.
- **Cleanup by id, counted both ends:** two web orders (the fixture and a DRAFT
  cart the review check created) and their lines, one purchase order with its
  line items and stage events, one `Document`, one audit row, two login
  attempts and the client were deleted; the R2 key answered **NotFound**.
  Users **2**, `CLIENT` **0**, web orders **0**, purchase orders **400**,
  documents **406**, line items **1606**, stage events **2323**, audits **5**,
  login attempts **68**, products **308**, the same as before.
- **1158/1158 tests, `tsc --noEmit`, `npm run lint`** (the same 2 pre-existing
  warnings, 0 errors) **and `npm run build`** clean.

## Not verified

- **Anything on production.** Not deployed.
- **The emails arriving.** Both went to Resend's test inbox; no inbox was read.
  The attachment is covered by unit tests only.
- **The order page at 390px**, which was measured at 768 only.
- **A confirmed order whose redraw fails.** Unit test only.
- **The ops document pane rendering the redrawn PDF.** R2 CORS refused origin
  `localhost:3001` (the port, not the change).

## Notes

- **Confirmed shop orders number their lines from 0 on the buyer's document.**
  `loadBuyerOrder` passes `LineItem.position` straight through, and the
  confirmed fixture read `0` and `1`. It is older than this phase and was not
  fixed; a web order still numbers from 1.
- **The redraw runs inside `after()`**, so for a moment after Confirm the
  stored file is the undated one.
- **PDFs already stored keep their old layout** until their order is confirmed
  or its date moves. Production's one shop order, `W-2609-00001`, is
  unconfirmed, so its confirm will redraw it.

## Previous phase

**Phase 41 — receiving a shop order, and the Source column — built across
thirteen tasks and driven in a browser on `feature/order-receipt`, merged to
`main` as `c983174` and deployed to production** (2026-09-17). Spec `docs/specs/41-order-receipt-and-source.md`, whose
§10 is now what was measured and §11 what was not. Asked for as: "revamp this
page. admin should be able to receive the purchase order when an order is
place from shop.lovinghandsportal by buyer. Also, it also need to add once more
column named source, indicating if this PO is coming from shop or uploaded
manually. Also superadmin or admin need to be receiving email when an Purchase
Order is placed by buyer".

**The admin notification email already existed, and nothing was built for
it.** `notify()` in `src/actions/cart.ts` mails every active `MEMBER` and
`SUPER_ADMIN` the moment a buyer sends an order, with the generated
purchase-order PDF attached and a link to `/web-orders/{id}`. The user
confirmed they receive it. This phase does not touch it; do not rebuild it.

A shop order must now be **received** before it can be confirmed —
`SUBMITTED → RECEIVED → CONFIRMED`. On `/web-orders/[id]`, **Receive order** is
the primary action until someone presses it; Confirm is disabled beside the
caption "Receive this order before confirming it.", and `confirmWebOrder`
refuses a submitted order with the same words. `receiveWebOrder` records who
and when in `receivedById` and `receivedAt` — kept apart from `reviewedById`,
which means who *decided* — and emails the buyer through a new
`WebOrderReceived` template that promises no date and attaches nothing.
Decline accepts a received order as well as a submitted one. The buyer's
`/orders` reads "Received by the team" and the last step of their step bar
reads "Received". On `/purchase-orders` a received order carries its own
**Received** badge and chip, so the shop backlog splits between *Needs review*
and *Received* instead of overlapping; a **Source** column after Status reads
**Shop** or **Manual**, sorts over the whole list and replaces the `WEB` chip;
*From the shop* now includes confirmed shop orders, so the dashboard's
"orders from the shop to confirm" line links to a chip-less filter,
`?status=shop-open`, holding only the unconfirmed ones it counts; and Uploaded
by reads `—` for every shop row. The eleven readers of `SUBMITTED` were decided one by one
(spec §7).

One migration, `20260918090000_web_order_received` — the enum value and two
nullable columns — and no new dependency.

## Verified, with the figures

Driven on the development database as a super admin and a throwaway `CLIENT`
(`delivered@resend.dev`, Resend's test inbox), with fixtures inserted directly
rather than sent through the cart, because the cart's `notify()` mails real
inboxes. Measurements in
`.superpowers/sdd/2026-09-16-order-receipt-and-source/task-13a-measurements.md`.

- **Confirming a received order writes its document.** `W-2609-00021`,
  received and then confirmed with a delivery date of 2026-09-25, read back
  with `PurchaseOrder.documentId` **`cmu4bso97000052otzg7ccpyd`, not null**,
  and R2 `HeadObject` on its key answered **3992 bytes, `application/pdf`**.
  This matters because for part of the build it was null on every confirmed
  shop order: confirm draws the PDF while the order is still `RECEIVED`, and
  the document guard refused that state. The confirm tests mock that module;
  a test now runs the real guard, and this read is the only live proof.
- **Receiving moves the chips by one each.** Needs review **4 → 3**, Received
  **0 → 1**, and the one row under *Received* read Status Received, Source
  Shop. The row read back `status RECEIVED`, `receivedAt
  2026-09-16T16:15:47.074Z`, received by Aisha Rahman. The Receive button was
  gone with no refresh and no reload; a second receive toasted **318 ms** after
  the click.
- **Who received survives the decision, both ways.** After confirm,
  `receivedById` was still Aisha's and `receivedAt` unchanged, beside
  `reviewedById` and `reviewedAt 2026-09-16T16:39:18.963Z`. `W-2609-00022`,
  received and then declined with a reason, read `status DECLINED` with
  `receivedById` and `receivedAt` **still set**; the buyer's `/orders` read
  "Not accepted".
- **The buyer sees it.** `/orders` read "Received by the team"; the order page's
  step bar read `Cart, done | Review, done | Confirm, done | Received, done` at
  390, 768 and 1440. Once confirmed it read **Confirmed** and offered Download
  PDF, whose URL route answered **200**.
- **The Source sort sorts the whole list, proved in the direction that
  discriminates.** At page size 10, descending put the only Shop row **1 of
  407** — which proves nothing, because the default sort by PO date also puts
  it first. Ascending put **ten Manual rows and no Shop row** on page 1 and the
  Shop row at **407 of 407** on page 41. Only a whole-list sort moves a row
  from 1 to 407.
- **Source reads true.** Every scan row read Manual; *From the shop* returned
  **1 row**, the confirmed `W-2609-00021`, and not the declined order.
- **Sweep:** `/purchase-orders`, `/web-orders/[id]` and the buyer's order page
  at 390 / 768 / 1440 — nine combinations. Eight passed first time;
  `/web-orders/[id]` at 390 read **405 / 390**, was fixed, and re-measured
  **390 / 390**, 768 / 768 and 1440 / 1440 against a contact named "Phase 41
  Overflow Test Contact With A Long Name". Receive, Confirm and Decline all
  clear 44px at 390; every sub-44px element is an already-accepted class
  or a field label beside a control that clears it.
- **Access.** A guest's `curl` on `/web-orders/[id]` got **307** to sign-in on
  the portal host and **404** on the shop host; the `CLIENT`'s own session got
  **404** with none of the order's controls in the body.
- **Cleanup, counted both ends.** Three web orders and their lines, one
  purchase order with its line item and stage event, one `Document`, one audit
  row, one login attempt and two throwaway `CLIENT` rows were deleted **by
  id**, and the PDF's R2 key answered **NotFound** afterwards. Counts returned
  to the baseline exactly — users **2**, `CLIENT` **0**, web orders **0**,
  purchase orders **400**, products **308**, buyers **11**, documents **406**,
  line items **1606**, stage events **2323**, audit events **5**, login
  attempts **68**.
- **1145/1145 tests, `tsc --noEmit`, `npm run lint`** (the same 2 pre-existing
  warnings, 0 errors) **and `npm run build` all clean.** After the final
  review's fixes: **1149/1149 tests across 93 files**, `tsc`, lint (the same 2
  warnings) and `build` clean again.

## Not verified

- **Any journey on production.** The deploy is Ready (`36tt4t7wr`), the site
  answers — `/` 307 to sign-in, `/signin` 200 from `sin1` — and the migration is
  applied there, read from build logs. No production screen was opened, no
  order received, and no production row read or written.
- **A real `MEMBER` receiving.** `aisha@lovinghandsportal.com` reads
  `SUPER_ADMIN` in development, so every live receive, confirm and decline was a
  super admin's. The action uses the same `requireUser()` guard as confirm and
  decline; the member case rests on that and on unit tests.
- **`confirmWebOrder` called directly on a submitted order.** Only the disabled
  button and its caption were seen. A crafted Server-Action POST is not a valid
  probe — Phase 40 recorded that it answers "Server action not found" for a
  super admin too.
- **Two people receiving at once**, or one order received twice. Unit tests
  only.
- **The emails arriving.** Each went to Resend's test inbox with no send error
  logged; no inbox was read.
- **An order placed through the real cart.** Every fixture was a direct insert.
- **Uploaded by reading `—` on a confirmed shop row.** Read live only on a
  submitted row; the confirmed case is verified by reading the code.
- **The buyer-detail page's open shop orders.** Its widened `where` has no test
  harness and was not driven.
- **The dashboard's `shop-open` link, live.** The line renders only with an
  unconfirmed shop order and development holds none; it rests on
  `po-list.sql.test.ts` and on reading the code. No browser or database was
  used for the final review's fixes.
- **Confirm racing a decline**, live. Unit tests only, and their transaction
  mock cannot roll back — the rollback itself is Prisma's.

## Notes

- **Preview deployments migrate the production database.** Vercel's build
  command is `prisma generate && prisma migrate deploy && next build` for every
  target, and the branch's preview build log printed its datasource as
  `ep-polished-wildflower-b3zeyn4i-pooler` — production. Pushing
  `feature/order-receipt` therefore applied `20260918090000_web_order_received`
  to production at 01:15:57 UTC, two minutes before `main` was pushed; the
  `main` build then logged **"21 migrations found … No pending migrations to
  apply."** Harmless this time — the migration is additive and the Phase 40
  code ran against it unchanged — but **any branch pushed with a migration
  changes production before review or merge**, and preview deployments read and
  write production data. The Preview `DATABASE_URL`/`DIRECT_URL` are Secret-type
  and cannot be read with `vercel env pull`; `vercel inspect <url> --logs`
  shows the datasource. Pointing Preview at its own Neon branch is a Vercel
  settings change, not yet made.
- **Production's `DIRECT_URL` is still the `-pooler` host**, checked
  2026-09-17. Both of the day's migrating builds succeeded through it; a P1002
  on a later deploy is the recorded consequence, and the fix is dropping
  `-pooler` from that one variable.
- **Production's one real shop order, `W-2609-00001`, sits in `SUBMITTED`** and
  now has to be received before anyone can confirm it. The team needs telling,
  rather than finding a disabled button.
- **`PurchaseOrder_documentId_fkey` has drifted since Phase 16, and was left
  alone on purpose.** The development database holds it as `RESTRICT`, from
  the first migration on 2026-09-05; the schema has implied `SET NULL` since
  `documentId` became nullable in Phase 16. This phase's cleanup felt it — the
  purchase order had to be deleted before its `Document`. Realigning it changes
  what deleting a document does on production, which is the user's decision,
  not a side effect of this phase. **The next `prisma migrate dev` anyone runs
  will try to fold that change into whatever migration it generates** — read
  the SQL before accepting it.
- **Aisha reads `SUPER_ADMIN` in development.** She already did before any task
  of this phase touched her, so she was left so. Earlier phases' notes assume
  a seeded `MEMBER`.
- **On a received order the buyer's step bar marks all four steps done**, the
  last reading "Received", with no current step. That matches spec §5 — the
  last step renames itself as it already did for "Confirmed" — but it is a
  presentation choice, and showing the last step as current until confirmation
  would be equally defensible. Worth the user's eye.
- **Nothing throttles shop submission.** The open-order cap was removed on
  2026-09-16 at the user's request, and this phase did not reinstate one.
- **Eight defects were caught before merge**, recorded with cause and fix in
  spec §10 "Found during the build": a `tsc` failure baked into Task 1; a crash
  on every submitted shop row, had the list emitted the raw status; every
  confirmed shop order losing its document; two SQL tests that passed with
  their behaviour deleted; Receive spinning Confirm; a status colour on the
  Source dot; the Uploaded by guard the plan deleted; and the 390px overflow.
  None was caught by a failing test.
- **The final whole-branch review found two more, both fixed** (spec §4, §6):
  - **Confirm could overwrite a decline.** Its last write, marking the web
    order `CONFIRMED`, guarded on the id alone. A decline committing between
    confirm's read and that write would have left a `CONFIRMED` order, a
    committed purchase order and a buyer emailed both outcomes. The write is
    now `updateMany` on `{ id, status: RECEIVED }`; a count of 0 throws inside
    the transaction, rolling the purchase order back, and answers "This one has
    already been reviewed."
  - **The dashboard's shop line led to more rows than it counted.** "1 order
    from the shop to confirm" linked to `?status=web`, which since this phase
    also holds every confirmed shop order. It links to `?status=shop-open` —
    the web branch alone, `SUBMITTED` or `RECEIVED`, exactly
    `openWebOrderCount` — which is allow-listed on the page but has no chip.
  - Folded in with them: the *From the shop* chip's dot is `bg-ink-secondary`
    rather than the amber *Needs review* one; receive's written `data` is
    pinned by equality; and the buyer's Status sort ranks `received` between
    submitted and Order placed.
- **Recorded, not fixed:**
  - the buyer-sort `received` rank the final review added has no test — no
    test covers sorting buyer orders by status at all;
  - **emails that link to a page which stops existing.** The Received email,
    like the receipt email from `cart.ts` before it, links
    `/orders/{webOrderId}`. Once the order is confirmed that id answers 404,
    because `loadBuyerOrder` then finds a purchase order under a different id
    and no longer returns a `CONFIRMED` web order. The **Confirmed email does
    not share the shape**: it links `/orders/{purchaseOrderId}`, as the stage
    emails in `stages.ts` do. The Declined email links the web order's id, and
    a declined web order stays readable there. A buyer-routing gap across the
    email sequence, older than this phase;
  - `receiveWebOrder` answers "This one has already been received." for a
    `DRAFT` or a missing id — its guarded `updateMany` cannot tell those apart
    from a real double receive;
  - `/web-orders/[id]` renders the review form for a `DRAFT` id (pre-existing);
  - a duplicated assertion in `product-detail.test.ts`;
  - `webOrderKind` maps every status that is not `DECLINED` or `RECEIVED` to
    `"submitted"` — unreachable under today's filters, but not exhaustive;
  - no test that `loadBuyerOrder` returns kind `"received"`, and two tests pin
    the same `listBuyerOrders` status list;
  - `buyer-detail.ts`'s open-shop-orders `where` is unpinned;
  - no test that the *Received* chip excludes the purchase-order branch, and
    none pinning `IntakeStatus`'s keys, its tones, the chips or the page's
    `STATUSES` allow-list (none existed before either);
  - the Source pill's classes duplicate `StatusBadge`'s private pill constant;
  - `WebOrderReceived`'s heading repeats its subject's literal rather than
    calling `webOrderReceivedSubject`;
  - a duplicated where-shape assertion in `confirm-web-order.test.ts`;
  - Confirm's handler resets `receiving` without the `try`/`finally` Receive
    uses;
  - the `kind === "confirmed"` arm of the step-bar state in the buyer's order
    page is unreachable.

## Previous phase

**Phase 40 — product listings — built across seven tasks and driven in a
browser on `feature/product-listings`, since merged to `main`** (2026-09-16). Spec
`docs/specs/40-product-listings.md`, whose §8 is now what was measured rather
than what was intended. Asked for as: "there's 2 same product … I want to put
it under the same product, so when buyer click in they can choose the variant";
"let superadmin list product and choose what variant they want to list under
same product"; "group them automatically if it's the same listing, and let
admin know the current listing existed and will be added a new variant"; "the
product code should be auto regenerated when the product is edited".

A shop listing is now **one product family in one market**, with flavour *and
pack size* as the variants a buyer chooses between. Pack size left the grouping
key; a variant's label carries its pack only where the listing holds more than
one. Both forms print the listing a product will join before it is saved, and
the same resolver runs inside the write, so the message and the outcome cannot
disagree. A new admin page, `/admin/catalogue/families/[id]`, shows a listing
one section per market and lets a super admin hide, show, remove or add a
variant. The edit drawer's SKU follows the product's edits when the generator
made the code, and holds still — offering Regenerate — when it did not.

No migration and no new dependency.

## Verified, with the figures

Driven on the development database as a real super admin and a real MEMBER;
full report in `.superpowers/sdd/2026-09-16-product-listings/task-8-report.md`.
**Nine of the twelve criteria passed outright, one passed in part, two passed
with a note, none failed.**

- **Pack size really did leave the key.** Four products — Lemon and Lime, each
  at 12 and at 6 per carton — drew **one** card reading "1 product", with four
  picker labels each carrying its pack. Moving the two 6-carton rows to another
  market split the same four into **two** cards, and each card's labels then
  dropped the pack, because neither mixes one any more.
- **A family in two markets is two cards**, both titled by the family: 8
  products of *Zen Garden Promo Hand Wash 500ML* drew Arab with its 6 variants
  and India with its 2, no variant on the wrong card.
- **The write reaches rows the admin never opened.** Against a derived group of
  two unplaced products, the create form said "2 products in no family yet.
  Saving puts all of them in one family", and submitting moved
  `productFamily.count()` **59 → 60** — one family, code `ZEN-SC-0500` — with
  **all three** rows reading back that same id, the two older ones included.
- **The SKU rule, both ways, with the codes.** A generated code followed a
  variant edit live, `ZEN-SC-0750-GMAP-VN` → `ZEN-SC-0750-FL-VN`, and saved. A
  code the generator did not make held still at `ZEN-SC-0500-GMAP-AE` while its
  Regenerate proposal moved to `ZEN-HW-0500-PROMO-FL-AE`; pressing it filled the
  field and the save wrote it. A regenerated code that collided was refused —
  "That SKU is already in use." — with **both** the SKU and the variant read
  back unchanged, so the rest of the edit did not slip through either.
- **Every control on the listing page was driven and read back**: Hide set
  `active` false and took the variant off the shop card without deleting the
  row; Show restored it; Remove set `familyId` null and the shop drew that row
  as its own derived card; Add set it back. Product count was 311 before and
  after.
- **The add-product picker offers unplaced products**, proven live rather than
  by reading code — the late fix for Prisma's `NOT` dropping NULL rows. With a
  row detached, the picker returned it; a placed candidate reads "· in Zen
  Garden Promo Hand Wash 500ML" beside its market.
- **The edit drawer does not match itself.** Opened on the only product with its
  name, the line read "This will be a new listing." — without the exclusion it
  would have claimed to join itself.
- **A real MEMBER gets a real 404.** Demoted, signed out and signed in again so
  the token carried the new role, `/admin`, `/admin/catalogue` and the listing
  page each answered **404** with none of the listing's content in the body.
- **Sweep:** the listing page, the create form with its listing line and a
  mixed-pack shop card at 390 / 768 / 1440 — nine combinations,
  `scrollWidth === innerWidth` on all nine. Console 0 errors on four pages.
- **Cleanup, counted both ends.** Four throwaway products, one family, three
  price rows and three image rows deleted **by id**; two detached products and
  two changed markets restored; all three R2 keys answered NotFound, so nothing
  was orphaned. Counts returned to the baseline exactly — products **308**,
  families **59**, images **0**, prices **0**, web orders **0**, purchase orders
  **400**, users **2**, labels **124**, unplaced **0**, inactive **0** — and
  `aisha@lovinghandsportal.com` was **read back** as `MEMBER` after the
  promotion.
- **1117/1117 tests, `tsc --noEmit`, `npm run lint`** (the same 2 pre-existing
  warnings, 0 errors) **and `npm run build` all clean.**

## Not verified

- **Anything on production.** This branch has never been deployed and no
  production database was read or written. Production holds **zero families**,
  so every card there is still derived — with pack size out of the key that
  alone merges a line's 6- and 12-carton rows — and **§7's backfill has not been
  run there**. It stands behind two other things: Phases 36–39 must deploy
  first, and production's `DIRECT_URL` still points at the pooled Neon host.
- **The two family actions' own super-admin refusal, live.** The route that
  registers them is unreachable for a MEMBER, which was measured; the actions'
  guard itself rests on its unit tests. A crafted Server-Action POST was tried
  and is *not* a valid probe — it answers "Server action not found" for a super
  admin too, so it proves nothing. Worth not re-deriving.
- **The ambiguous branch** ("matches 2 listings — choose a family"), because no
  product in development has siblings in two families. Covered by unit tests.
- **A family-code collision on the derived-group create** — the one such create
  in this pass produced a free code.

## Notes

- **The families table that points at the listing page is the `/products`
  family view**, not the admin room's own families section. The admin section
  still links its product count to the ops product list, has no Markets column,
  and captions itself "A product joins or leaves a family from its own page" —
  so a super admin standing in the admin room reaches a listing page only
  through a create or edit form's line. Recorded, not fixed.
- **The Markets column reads 0 where the listing page says 1.**
  `groupFamilies` counts only non-null markets, so a family whose products carry
  no market reads "0 markets" in the table while its own page says "4 variants
  across 1 market" and the shop draws it one card. Phase 36's counting; Phase
  40's column is what exposes it.
- **The listing page shows the family's code, name, brand and size read-only.**
  Editing them is still the admin catalogue's job.
- **One new sub-44px control**, recorded rather than adopted into the accepted
  list: the listing line's family link measures 281×33 at 390px. It is a text
  link inside a caption, the same shape as the "Manage values" links beside it.
- **Presigned product-image uploads answer 403 in development**, three of three.
  The form toasts "Product created, but the images didn't upload"; every key
  answered NotFound afterwards, so nothing is orphaned in R2, but the product
  row and its image row are still written. The upload path is untouched by this
  phase — pre-existing, and it means the create form cannot finish cleanly in
  development until someone looks at it.
- **A renamed family code makes its generated SKUs look hand-typed**, by
  design: the equality test recomputes from the family's current code, so a
  recoded family offers Regenerate rather than rewriting on its own. The safe
  side of the rule.
- **`createProduct` has had no caller since Phase 39** and was not taught the
  resolver. Whether to delete it is still the user's decision.

## Previous phase

**Phase 39 — a product's variants at creation, and buying several at once —
built on `feature/variant-creation`** (2026-09-16). Spec
`docs/specs/39-variant-creation-and-multi-add.md`. `/products/new` enters a
product and every flavour of it in one submit and one transaction, so a
duplicate SKU on the seventh row leaves no half-entered catalogue behind.

## Previous phase

**Phase 38 — order confirmation and the expected delivery date — built,
verified and committed on `feature/order-confirmation`** (2026-09-15).
Spec `docs/specs/38-order-confirmation.md`. The last of the three phases
planned together on 2026-09-15. Asked for as: "admin or superadmin should see
the order placed under Purchase Order tab, pending approval and review the
delivery date. Once the delivery date is confirmed, it should be reflected to
shop and send email to buyer saying the order is confirmed and showing
expected delivery date. Product page should note there's an associated
Purchase Order."

Confirming a shop order now requires an expected delivery date, prefilled from
the day the buyer asked for — which the ops review screen could not previously
show at all. The buyer is emailed when an order is confirmed, when it is
declined, and when the date later moves; the date appears on their list, their
order, and the purchase-order document. The ops product page lists the open
shop orders containing a product.

No migration: `PurchaseOrder.deliveryDate` has existed since Phase 01 with no
reader or writer in application code.

## Notes

- **The delivery-date column was dead in code but not in data.** All 400
  seeded purchase orders carry one, written by `prisma/seed.ts`, and Phase 11
  kept the column on purpose when it removed delivery date from every screen.
  That older data means *the date printed on the customer's PO*; this phase's
  means *the date the team commits to*. Harmless in development, and invisible
  on production, where no real order has ever had the column written — but
  check it on the first deploy rather than assume.
- **The decline path was driven end to end for the first time.** Every earlier
  phase recorded it as unverified because no declined order existed in
  development. The toast has said "and the buyer told" since Phase 16; that is
  now true.
- **Emails go through `after()` and never block the action.** A failed send
  costs a nudge, not a confirmation.

## Previous phase

**Phase 37 — the purchase-order file — built, verified and committed on
`feature/purchase-order-pdf`** (2026-09-15). Spec
`docs/specs/37-purchase-order-pdf.md`. Asked for as: "send an email including
the purchase order file to customer and notify admin or superadmin via email
with purchase order file too."

The moment a buyer sends an order, an A4 PDF of the purchase order is
rendered from the same `PoDocumentData` the on-screen preview draws, stored in
R2, filed as a `Document`, attached to both the buyer's receipt and the team's
notification, and carried onto the `PurchaseOrder` when the team confirms it —
so the ops document pane shows a real document for the first time. The buyer
downloads their own copy through a buyer-scoped route; the ops-wide one stays
closed, as Phase 35 recorded.

One additive migration (`WebOrder.documentId`) and one new dependency
(`@react-pdf/renderer`, plus the `server-only` marker). The orphan sweep was
fixed in the same commit as the migration: without `webOrder: null` it deletes
every generated file an hour after it is written.

**Still to come in this set:** Phase 38, order confirmation and the expected
delivery date (`docs/specs/38-order-confirmation.md`).

### Phase 37 notes

- **`@react-pdf/renderer` has never run on Vercel's linux runtime.** It loads
  a WebAssembly layout engine, which is the same shape of risk as the sharp
  failure of 2026-09-08 — a macOS build proves nothing about the deployed one.
  Check the first deploy by sending one order and reading
  `WebOrder.documentId`. It is kept out of the bundle by
  `serverExternalPackages`, and the renderer is marked `server-only`.
- **`server-only` throws under every export condition but `react-server`**, so
  `vitest.config.mts` aliases it to the package's own `empty.js` — the very
  file that condition resolves to. Running a script through `tsx` against the
  renderer needs the same treatment; `--conditions react-server` does not work,
  because it breaks `@react-pdf/hyphenate`'s own exports. Render samples
  through vitest instead.
- **The stored PDF is the order as sent**, drawn once at submit and not
  redrawn at confirm. Regenerating it with the PO number and the agreed
  delivery date belongs with Phase 38, where that date first exists.
- **The supplier block still prints only a name** — no `OrgSettings` row — and
  it now leaves the building as an email attachment, which raises the stakes
  on filling it in at `/admin`.
- **Two Prisma migrations are now pending on production**, Phase 36's and this
  one, and `DIRECT_URL` still points at the pooled Neon host (Phase 30). Fix
  that before either merge deploys.

## Previous phase

**Phase 36 — product families — built, verified and committed on
`feature/product-families`** (2026-09-15). Spec
`docs/specs/36-product-families.md`, whose §6–§9 record the backfill as it
ran, what was verified, what is known and what is not. The first of three
phases planned together on 2026-09-15 — 36 product families, 37 the
purchase-order PDF (`docs/specs/37-purchase-order-pdf.md`), 38 order
confirmation and the expected delivery date
(`docs/specs/38-order-confirmation.md`). Asked for as: "design a human
readable product code … smallest granularity should be until variant level,
but later on I should be able to analyse by product level" and "revamp the
product listing from admin or superadmin".

A `ProductFamily` table — code, name, brand, category, size — with a nullable
`Product.familyId`. Family code `ZEN-SC-2100`; a new product's SKU proposes
itself as `ZEN-SC-2100-GM-VN` from the family. Existing SKUs are never
rewritten; the 308 products get families through a propose → review → apply
script. `/products` gains a family view; `/products/[id]` a family card;
`/admin/catalogue` a families section; the shop groups by family where one
exists.

**Before this merges deploys:** production's `DIRECT_URL` still points at the
pooled Neon host (carried since Phase 30) and this phase carries a migration.

## Notes

- **Development holds 59 families, every product placed**, from
  `docs/imports/product-families-2026-09-15.json`. Two judgement calls in it
  are the business's to confirm: *ZEN SIGNATURE* merged with *NORMAL/DIY*
  into one 2.1L shower cream, and L.Hands' cap and pump dishwash kept as two
  families. Either is a rename or a move in `/admin/catalogue` and the
  product drawer, no code.
- **The shop's card count is the cheapest check on a family decision.** The
  first review run pulled AA Pharmacy's `H/WASH 500ML` into `ZEN-HW-0500`
  because decisions were keyed on line text alone, and the shop went from 83
  cards to 82. Fixed in the script and the data; the count is back at 83.
- **A dev server started before `prisma generate` keeps the old client** and
  answers "Unknown field `family`" for every new relation. Restart it after
  a migration.
- **Production's backfill must be proposed afresh there**, not replayed from
  the development file: its catalogue is different (309 products, eight with
  the customer's own codes) and the ids in the file are development ids.

**Phase 35 — the buyer's order table, and the purchase order behind each
order — built, verified and merged from `feature/buyer-order-review`** (2026-09-15).
Asked for as: "revamp buyer order page, show a table with more infomation" and
"when buyer clicked in each order, it must show the PO documents for them to
review".

`/orders` was a stack of link cards carrying a reference, a date, a status and
a total. It is a sortable six-column table now — **Order, Your PO no., Date,
Status, Lines, Total** — and "Your PO no." is the buyer's own reference, a
column stored on both order sources since Phase 32 and shown on no screen
until now.

Opening an order draws **the purchase order itself**, from the order's own
stored lines, with **Print or save as PDF** beside it. It is the same artboard
and the same `PurchaseOrderPreview` the buyer read before confirming, so there
is one purchase order rather than a checkout version and a history version
that can drift apart.

No migration, no new dependency.

## Goals

- `listBuyerOrders` sorts the whole merged list before it pages it, and
  `DataTable` is reused rather than a second table grown for the shop.
- `buildPoDocumentFromOrder`, pure, beside Phase 33's cart builder and
  returning the same `PoDocumentData`.
- Print through one `window.print()` and an `@media print` block — no PDF
  library. Phase 19's generated file is still unbuilt and still the only way
  to get a real download.

## Notes

- **The original scan is still not shown**, deliberately. A purchase order the
  team keyed in from a PDF the buyer emailed has that file in R2, but
  `/api/documents/[id]/url` is ops-wide and unscoped by buyer — a hazard
  already recorded in that route — so exposing it to clients needs a
  buyer-scoped route, which was out of scope here. Every order draws its
  rebuilt document instead, which is the one thing that works for both kinds.
- The lines card and the document say the same thing on purpose: A4 is 794px
  and scrolls inside its own container on a phone, so the card stays the quick
  read and the document is the record.
- **The supplier block still prints only a name** — no `OrgSettings` row
  exists, so address, email and phone are still unset. Unchanged by this phase
  and still worth doing before a buyer prints one.

### Verified, as a real buyer

- **Both kinds of row, in a browser.** Signed in as a `CLIENT` against a buyer
  holding **51 confirmed purchase orders**, placed a real shop order through
  the cart with the PO number `KS-PO-4471`, and read the table: the new order
  on top carrying that reference, the confirmed ones below reading *QC passed*,
  *Delivering*, *Delivered*.
- **Sorting sorts the list, not the page** — proven with a figure only the
  whole list has: sorting by Total descending put **RM 99,689.38** first
  against a page of 20 out of **52**, which page-local sorting could not
  produce. A unit test asserts the same thing on page 2 for the same reason.
- **Blanks sink in both directions.** Sorting on "Your PO no." — one row with
  a value against 51 without — put that row first at `dir=asc` *and* at
  `dir=desc`, read off two separate responses. My first implementation
  returned 0 for a blank while the comment above it claimed blanks sort last;
  the test was written to the comment, failed, and the code was corrected to
  match rather than the comment softened.
- **The document draws for both kinds**: the web order printed `KS-PO-4471` in
  the masthead, `W-2609-00015` in the footer, the buyer's note, `45 days` terms
  and both product codes; the confirmed `PO-2026-0051` printed its four
  extracted lines and totalled **3,761.97** against the order's own 3,761.97.
- **Print was measured, not asserted.** Under `emulateMedia({ media: "print" })`
  the shop header, the category strip, the lines card, the Print button itself
  and the shop footer all computed `visibility: hidden`, while the document and
  its own footer computed `visible`; the scroller's `overflow-x` computed
  `visible` and its padding `0px`, and the sheet's `box-shadow` `none`.
- **Two defects the browser found that the build could not.** The document's
  footer still read *"This is a preview. The order is not placed until you
  confirm it."* on an order that had already been placed — it takes a
  `footnote` now, and the three order kinds each say what is true of them. And
  the detail page had no metadata at all, so every order titled its tab
  "Zen Garden"; `generateMetadata` names the order, scoped through
  `requireClient` so another buyer's id titles the tab "Order".
- **A defect found by reasoning about production rather than by the seed.**
  The document originally refused to draw wherever its lines did not reach the
  order's total, which would have been correct on the 400 development orders —
  **all of which carry `tax: 0`** — and wrong on any real purchase order
  carrying SST, where the buyer would have seen a red error instead of their
  order. `PoDocumentData` carries `tax` now, prints it as its own row only
  when there is some, and adds it to the total; a zero is still no tax,
  because a "Tax 0.00" row reads as a charge to check.
- **The leak guard was watched failing.** `loadBuyerOrder` now reads a `Buyer`
  — the row carrying `remark`, the internal note about the customer — so a new
  test pins that select by equality. Adding `remark: true` made it fail
  (`+ "remark"` in the diff) and removing it made it pass. `PurchaseOrder.notes`
  stays unselected; the note the document prints comes from the buyer's own
  `webOrder`, pinned by its own test.
- **Sweep:** `/orders`, a confirmed order and a web order at 390/768/1440 —
  nine combinations, `scrollWidth === innerWidth` on all. At 390 the table
  drops to `DataTable`'s card mode with a Sort select; every sub-44px element
  is an already-accepted class (`SkipLink`, the wordmark, the 32/36px search
  and category chips, footer rows, card-mode title links). Console: 0 errors.
- **Cleanup, counted both ends.** The throwaway `CLIENT`, its shop order and
  two lines, one `SIGNED_IN` audit row and one `LoginAttempt` were deleted
  **by id**; counts returned to the baseline exactly — users **2**, CLIENT
  **0**, web orders **0**, lines **0**, buyers **11**, purchase orders
  **400**, line items **1606**, products **308**, audits **5**, login attempts
  **63**. Three temporary scripts at the project root were removed.
- **925/925 tests** (13 new), **`tsc --noEmit`**, **`npm run lint`** (the same
  2 pre-existing warnings, 0 errors) **and `npm run build` all clean.**

**Not verified:** anything on production — this branch has never been
deployed. Printing was measured through Chrome's print emulation rather than
by producing a physical PDF, so pagination of a purchase order longer than one
A4 page is untested — every order to hand fits on one. A declined order's
wording on the document was not driven in a browser; no declined order exists
in development.

**Phase 34 — the Zen Garden rebrand, and Confirm order last — built and
verified on `feature/zen-garden-rebrand`** (2026-09-15). Asked for as: "in the
review page, put the Confirm Order section in the last, after the Purchase
Order" and "change all Loving Hands to Zen Garden in pages in all
shop.lovinghandsportal.com, and lovinghandsportal.com. We are rebranding to
Zen Garden."

Every user-visible "Loving Hands" on both hosts is now "Zen Garden" — the
wordmark (`Zen` in the brand gradient, `Garden` in ink), every page title, the
shop hero and footer, the five email templates and their own wordmark, the
sign-in card, and the supplier name the purchase-order document falls back to.
The domains are untouched: `lovinghandsportal.com`, `shop.lovinghandsportal.com`
and every `@lovinghandsportal.com` address still read as they did.

On `/checkout/review` the summary-and-Confirm card left the right-hand column
and became the last block on the page: **Order details** and **Deliver to**
pair up two-across, the note card and the A4 purchase order run full width
below them, and the buyer confirms underneath the document they just read.

No migration, no new dependency, no schema change.

## Goals

- One display name across both hosts, with the domains and email addresses
  deliberately unchanged.
- The extraction prompt naming **both** names, so the 400 purchase orders
  already filed — and any document a customer sends this week still printing
  "Loving Hands" — are read as the seller rather than the buyer.
- `ReviewSendForm` reordered so Confirm order is the last thing on the screen.

## Notes

- **`EMAIL_FROM` in production was already right, and this was recorded
  wrongly first.** The note here said mail would keep arriving from "Loving
  Hands Portal" until someone edited the Vercel variable. The user's own screen
  shows it reading `Zen Garden <no-reply@kim-brothers.com>`, updated
  2026-09-11 — four days before this rebrand. So no environment change is
  owed. Two things follow that are worth not re-deriving: production's sender
  domain is **kim-brothers.com**, not `lovinghandsportal.com`, and it sends as
  "Zen Garden" rather than "Zen Garden Portal", so the repository's
  `.env.example` and `SETUP-CHECKLIST.md` are illustrative here rather than a
  copy of the live value.
- **The docs and the canvas were swept in a second pass**, after the app
  merged: `CLAUDE.md`, `context/project-overview.md`,
  `context/design-system.md`, `docs/specs/00-master.md`, `02-auth.md`,
  `04-extraction-review.md`, `SETUP-CHECKLIST.md`, the portal design spec, the
  four `docs/specs/design/shop` specs, and all 40 canvas files — every
  artboard, both published bundles (whose wordmark spans are JSON-escaped, so
  they needed their own pass) and every render. 51 files.
  **Dated historical records were deliberately not swept**, because editing the
  old name out of them would make them false: `docs/specs/plans/**`,
  `docs/superpowers/plans/**`, `docs/specs/20260906_UI_change.md`, and this
  file's own History — the 2026-09-05 entry records renaming ZenGarden *to*
  Loving Hands, which cannot be rewritten without becoming nonsense.
  **Filenames were left alone too** — `loving-hands-portal-canvas.html`,
  `loving-hands-storefront.html` and `docs/specs/design/loving-hands-portal-design.md`
  keep their names, like the domains, so no path or link breaks.
- `AvatarBroadcast`'s `BroadcastChannel` key is still `"loving-hands.avatar"`.
  It is an internal channel name with no user-visible surface, and renaming it
  would only desynchronise tabs open across the deploy.
- **The supplier block still prints only a name.** No `OrgSettings` row
  exists, so the document's fallback — now "Zen Garden" — is all that shows;
  address, email and phone are still unset and still need filling in on
  `/admin` before a purchase order reaches a real customer.

### Verified, as a real buyer and a real member

- **Both hosts, in a browser.** A `CLIENT` session on `shop.localhost` read
  the header wordmark, hero eyebrow ("ZEN GARDEN WHOLESALE"), footer
  ("© 2026 Zen Garden.") and page titles ("Review your order · Zen Garden");
  an ops `MEMBER` on `localhost` read the sidebar wordmark and
  "Dashboard · Zen Garden Portal". `document.body.textContent` on the review
  page matched **"Zen Garden" 8 times and "Loving Hands" 0 times**.
- **The purchase-order document itself** printed the Zen Garden wordmark and
  `SUPPLIER Zen Garden`, and still updated live: typing `PO-REBRAND-1` put it
  on the document without a reload.
- **The order, measured rather than eyeballed.** At 1440px the section tops
  read Order details 453, Deliver to 453 (same row), note card 804, purchase
  order 1034, summary 1962, **Confirm order 2192** — last on the page. At
  768px the same order held; at 390px the cards stacked (559 / 912 / 1161 /
  1409 / 2358) and the button went full width at 300×52.
- **A defect the browser found that the build could not.** `sm:mx-auto` did
  not centre the Confirm button — the `Button` primitive is `inline-flex`, and
  auto margins have no effect on an inline-level box, so it sat hard left
  under a centred caption. A `sm:flex sm:justify-center` wrapper fixed it,
  re-measured at **0px** between the button's centre and the card's.
- **No horizontal overflow** at 390 / 768 / 1440 —
  `scrollWidth === innerWidth` on all three.
- **Cleanup, counted both ends.** One throwaway `CLIENT` contact was created
  against an existing buyer for the journey and deleted afterwards with its
  one `SIGNED_IN` audit row and two `LoginAttempt` rows, all **by id**.
  Counts returned to the baseline exactly: users **2**, CLIENT **0**, buyers
  **11**, products **308**, purchase orders **400**, line items **1606**, web
  orders **0**, `OrgSettings` **0**, audits **5**, login attempts **63**;
  `aisha@lovinghandsportal.com` read back as `MEMBER`. The shop cart leaves
  nothing behind by design — `priceCart` takes its lines from the client, so
  no `WebOrder` row exists until send, and `localStorage` was empty after.
  Four temporary scripts at the project root were removed.
- **912/912 tests, `tsc --noEmit`, `npm run lint`** (the same 2 pre-existing
  warnings, 0 errors) **and `npm run build` all clean.**

**Not verified:** anything on production — this branch has never been
deployed. The five rebranded emails were not sent; only their source strings
were checked, and `@react-email/render` is still the missing optional
dependency recorded on 2026-09-13. The extraction path was not driven against
a real document (that spends an Anthropic call); the prompt change is covered
by its unit test alone.

**Phase 33 — The purchase order preview, and the steps — built and verified
on `feature/po-preview-and-steps`** (2026-09-14). Spec
`docs/specs/33-po-preview-and-steps.md`. Asked for as: "still no preview of
the purchase order?" and "show the step for each order. Cart → Review →
Confirm → Will be contact by team."

The buyer now reads the real purchase order — the approved artboard, drawn
from a pure builder — on the review screen, and it updates as they type. A
four-step bar runs across the cart, the review screen, the sent screen and
each order's own page. The review button says **Confirm order**.

No migration and no new dependency. The document is a preview, not a stored
file: generating a PDF remains Phase 19, still unbuilt.

## Goals

- `src/lib/purchase-order-document.ts`, pure, totalling from its own lines and
  refusing to draw a document that contradicts the order.
- `PurchaseOrderPreview`, the artboard rebuilt on design-system tokens, fixed
  at A4 and scrolling inside its own container.
- `CheckoutSteps` on four screens, with a guest's cart and a declined order
  both deliberately excluded from promising what is not coming.

## Notes

- **The supplier block prints only a name until the contact details are
  filled in on `/admin`.** No `OrgSettings` row and no `ZEN_GARDEN_*`
  variable exist, so Phase 24's per-field fallback correctly yields nothing
  for address, email and phone. This needs doing before a purchase order
  reaches a real customer; it takes no deploy.
- **Production's `DIRECT_URL` is still wrong** and will fail the next deploy
  that carries a migration. It points at the pooled Neon endpoint and must
  drop `-pooler`. `.env.local` line 37 has the same inversion.
- Production holds **one** active product, so the Phase 31 variant grouping
  cannot be seen there yet.
- Still unbuilt from the Phase 18 design: the `/checkout` gate, the
  new-customer access request and its admin approval. Phase 19, the generated
  purchase-order file, is also unbuilt.

## History
- 2026-09-18: A carton stepper on the catalogue card — merged from
  `feature/shop-card-carton-stepper` and pushed. Asked for as part of a review
  of shop add-to-cart, of which **everything else already held and nothing was
  rebuilt**: the product page's buy box and each variant row already carried a
  stepper defaulting to 1, `cartonsSchema` already refused a non-integer or
  anything below 1 (`.int("Whole cartons only").positive("Order at least one
  carton")`, capped at 9,999), `WebOrderLine.cartons` already stored the count
  with no price, `piecesFor` and `lineTotal` already derived pieces and amount
  from `packSize` and the list price, the cart already used the same
  `CartonStepper` under a **Cartons** column, and `buildPoDocument` already fed
  `line.cartons` to `documentQuantities` for Total Cartons, Total Pieces and
  Total Pallets. Verified as a guest before changing anything: 3 cartons of
  `MR.KING 1.5L — Lime` read RM 472.50 in the buy box, stored exactly
  `{"productId":"cmtvclarl…","cartons":3}`, and the cart read 18 pieces and
  RM 472.50.
  **The one gap was the card**, whose Add to cart always added one. It now has
  its own stepper above the pill, under a "Cartons" caption matching the cart's
  column, and hands that count to `AddToCart`. It **resets to 1 when the buyer
  picks another flavour** — three of Lemon says nothing about Lime — and
  otherwise holds, as the buy box does, so a second press adds that many again.
  `CartonStepper` gained a `card` size: `md`'s 44px buttons, which are not
  negotiable, with the value taking whatever is left between them, and no
  pieces caption — a line under every card in a grid to repeat what the card's
  own pack line says. No admin screen was touched.
  Driven on development, port 3000, as a guest on `shop.localhost`. A card
  stepped to 4 and added stored `{"productId":"cmtvcljy5008b03otou4nmilz",
  "cartons":4}`; the cart then read "1 product · 4 cartons", its own stepper at
  4, and **RM 840.00** against RM 210.00 per carton. Picking another flavour on
  the card put it back to **1**. At 390, where cards are two-up in a 165px card,
  the page did not overflow (390/390) and both stepper buttons measured
  **44×44** beside a 44px-tall value; 768 and 1440 clean too.
  **Recorded, not fixed:** that value box is **27px wide** at 390 — the width
  two 44px buttons leave inside a 165px card. One or two digits read fine and
  the buttons are the primary control; three would crowd it. Widening it means
  one card per row on a phone, which is a catalogue layout decision, not this
  one. The roomier steppers on the product page and in the cart are unchanged.
  1233/1233 tests (3 new on the card: the stepper is offered, labelled and
  starts at 1; that count reaches Add to cart; One fewer starts disabled, so no
  line can be added at zero), `tsc`, lint (same 2 warnings) and `npm run build`
  clean. Nothing was written to the database and the guest cart was cleared.
  **Not verified:** anything on production; a signed-in client's card add,
  which goes through `addToCart` rather than the guest cart (the same `cartons`
  argument, covered by the action's own tests); and typing a count into the
  card's box rather than stepping it.
- 2026-09-18: A moved expected delivery date names both dates and asks why,
  and the header loses its status pill — merged from
  `feature/po-delivery-reason` and pushed. Asked for as: record what
  the date changed from and to, require a remark for it, remove the status
  beside Download original, and rename that button Download.
  **Both dates, and a reason.** `updatePurchaseOrder` used to record
  "Edited: expected delivery" — the field's name, which cannot answer what it
  changed *from*, the one question that row is read to settle. The activity
  note now leads with `Expected delivery 21 Sep 2026 → 28 Sep 2026`
  (`Expected delivery set to …` where there was none, `… cleared (was …)` where
  it is removed), and any other fields that moved follow it by name as before.
  A **reason is required whenever that date moves**: a new box on the edit
  sheet that appears only then, refused by the action as well as the form
  (`REASON_REQUIRED`). It is deliberately **not** the order's own Remark, which
  is one standing field the next edit would overwrite — the reason belongs to
  the change, so every past move keeps its own.
  The reason rides in the same `note` column as the system's line, after a
  newline: `composeEditNote` writes it and `splitEditNote` reads it back, both
  in `po-activity.ts` so the two cannot drift. `LifecycleItem` dropped the
  `{ text, quoted }` note for two named fields — `detail`, the system's record,
  shown plainly, and `note`, the person's words, quoted — which is what the
  row needs to show both at once. No migration.
  **The status pill left the page header**: the Status card immediately below
  opens with the same badge, so the header's row is its actions alone.
  **"Download original" is "Download"**, on the header button and on the
  document pane's error card, which share the component.
  **A compile error `tsc` and the tests both passed over:** `REASON_REQUIRED`
  was first exported from `src/actions/stages.ts`, and a `"use server"` file
  may export nothing but async functions. 1230 unit tests and `tsc --noEmit`
  were clean while every page carrying the edit sheet answered **500**; only
  the Next compiler says so. The constant lives in
  `src/lib/validation/purchase-orders.ts` now, imported by both sides.
  Driven on development, port 3000, as Aisha on `PO-2026-0063`. The header read
  **"Download | Edit | Delete"** with no pill. In the edit sheet the reason box
  was **absent until the date changed**, then appeared captioned "Recorded with
  this change, beside the old and new dates."; Save with it blank showed **"Say
  why the expected delivery date is moving."**, set `aria-invalid`, moved focus
  to the box, left the sheet open and sent **0 POST requests**. Filled in, the
  save wrote **one** row: "Aisha Rahman edited this order" over
  "Expected delivery 21 Sep 2026 → 28 Sep 2026" and
  "Buyer asked to push it a week." in quotes, actor and time once. The server
  guard was **watched failing** with the check disabled — the new test reported
  `{ success: true }` where it expected the refusal — and passes with it back.
  The test edit's event deleted by id and `deliveryDate` restored to 21 Sep
  2026; counts back to 2323 stage events and 400 purchase orders. 1230/1230
  tests (5 new: the refusal, both dates and the reason on the row, the set and
  cleared wordings, and the field list unchanged when the date holds still),
  `tsc`, lint (same 2 warnings) and `npm run build` clean.
  **Not verified:** anything on production; a member's view; the buyer's
  "delivery date has moved" email, which is **unchanged and does not carry the
  reason** — the reason is an internal record, and telling the buyer was not
  asked for; and a shop order's confirm screen, which sets a delivery date
  through `confirmWebOrder` rather than this action and so asks for no reason.
- 2026-09-18: The feed's stage names move into the sentence, an edit says it
  was an edit, and the list pages at ten — built and driven on
  `feature/po-feed-pills-and-paging`, not yet committed. Four changes to
  "Notes and activity" only; the stepper is untouched. Merged and pushed.
  **The stage tag beside the Activity pill is gone**, because the sentence now
  names the stage itself: `describeActivity` returns `ActivitySegment[]`
  rather than a string, so "advanced this order from [In production] to [QC
  passed]" draws both ends as the same status pill the header, the Status
  heading and the stepper use. The wording and the from → to order are
  unchanged; `activityText` flattens the pieces back to one string for a test
  or a screen reader. The tag could only ever repeat one end of a move, which
  is why it was the thing to drop.
  **A successful header Edit reads "{actor} edited this order"** with the
  fields it moved underneath as the row's note. `updatePurchaseOrder` already
  wrote exactly one `EDIT` event per successful save and none when nothing
  changed, so this is the sentence, not the write path: the field list used to
  be spliced into the sentence, which made an edit of four fields the longest
  line in the feed. **An edit's note is not quoted** — the system wrote it, and
  quotation marks would put words in somebody's mouth — so `LifecycleItem.note`
  carries `{ text, quoted }`, quoted for a person's note on a stage move and
  plain for an edit's field list and a totals mismatch's figures.
  **Ten rows a page, newest first**, with "1–10 of 14" and Previous / Next
  under the feed. Paged in the browser rather than through the URL: the feed is
  one card on a page that also holds a document and a summary, and a `?page=`
  round trip would re-render all of it and scroll the reader back to the top of
  the order to read the next ten rows of its history. `LifecycleFeed` is a
  client component for it, and the page is clamped to the last one that exists,
  so a feed that shortens under a reader cannot strand them past the end.
  `LifecycleItem.stage` was removed: nothing renders it now.
  Driven on development, port 3000, as Aisha on `PO-2026-0063`, against ten
  fixture stage events inserted directly (advances, three moves back, notes on
  five of them) so there was a second page to turn. Page 1 read **10 rows,
  "1–10 of 13", "Page 1 of 2"**, every stage name a pill inside its sentence
  and no tag beside the Activity pill; Next gave **3 rows, "11–13 of 13"**,
  oldest last ("Aisha Rahman confirmed the order"), Next disabled and Previous
  live. A **real edit through the header sheet** — payment terms 30 → 45 days
  and a remark — wrote one row, "Aisha Rahman edited this order" over the plain
  "Edited: payment terms, remark", and the count went 13 → 14. No overflow at
  768 (768/768) or 1440 (1440/1440); at 390 the feed's rows end at 345 inside a
  390 viewport and the sentence wraps with its pills, while **the page still
  overflows at 480 against 390 from the header's Download/Edit/Delete row** —
  the defect recorded on 2026-09-18, which measures wider or narrower with the
  header's stage pill. Ten fixture events and the edit's event deleted by id,
  `paymentTerms` restored to "30 days" and `notes` to null; counts back to 2323
  stage events and 400 purchase orders, the PO reading `IN_PRODUCTION` with its
  original `stageChangedAt` and its two original events. 1225/1225 tests (the
  sentence tests rewritten to assert both the flattened wording and the
  segments), `tsc`, lint (same 2 warnings) and `npm run build` clean.
  **Not verified:** anything on production; a member's view; the Note pill,
  which no stored record can produce; and whether `PO-2026-0063.notes` was null
  or "" before the test edit — it was restored to null, which is what
  `emptyToNull` stores for an empty field anyway.
- 2026-09-18: One row per action, stage names as the status pill, and
  "Lifecycle" renamed "Status" — merged from
  `feature/po-status-rows-and-stage-chips` and pushed. Asked for as
  three changes to the PO detail page, with "do not restyle the whole app".
  **One row per action:** a stage move and the note left with it were an
  Activity row followed by a Note row carrying the same avatar, the same name
  and the same timestamp for a single click. `LifecycleItem` now holds
  `title` (the sentence) and `note` (what the person wrote) on one record, so
  the feed is one row per stored event: pill, stage chip, sentence, the note
  under it in quotes, then actor · time once. An "Edited: …" note is still
  dropped, because the sentence already names those fields; a totals-mismatch
  note is kept under its sentence, because it carries figures the sentence
  does not. The **Note pill is now reserved for a note with no activity to
  ride on** — `PoEventKind` is `STAGE | EDIT` and nothing writes a note-only
  event, so no row renders one today; a note without a matching activity is
  rendered rather than dropped if one ever arrives.
  **Stage names are the header's pill everywhere on the page:** the Status
  heading, all six stepper labels and each feed row's stage tag now render
  `StageBadge`, which gained `state` (`current` = the header's badge
  unchanged, `done` = `ink-secondary`, `upcoming` = `ink-tertiary` with a
  hairline dot rather than the stage's ramp colour, which would promise a
  stage not reached) and a `compact` padding for the six-across row. No
  second palette: `done`/`upcoming` only step down the ink ramp the stepper's
  plain labels already used. Advance/Move back permissions, the "from X to Y"
  sentences, confirm-closes-composer, the document viewer and the emails are
  untouched.
  **"Lifecycle" → "Status":** exactly one user-visible string existed, the
  card's eyebrow. `LifecycleFeed`, `LifecycleActions`, `buildLifecycleFeed`
  and the code comments keep their names, per the brief.
  **A defect the browser found:** dropped into the `font-display` heading, the
  pill inherited Plus Jakarta Sans at weight 650 with the heading's -0.54px
  tracking, which closed the space in "In production" — the same badge reading
  differently from the one two rows above it. The pill states its own type now
  (`font-sans font-normal tracking-normal`), and the design system's rule that
  the two families are never crossed makes that the correct fix rather than a
  local override: measured 105px in the heading against 109px in the header,
  then **109px in the header, the heading and the feed alike**, all Inter at
  normal tracking.
  Driven on development, port 3000, as Aisha on `PO-2026-0063`: advancing to
  QC passed with "QC good — carton 3 repacked." produced **one** feed row —
  avatar, Activity, the QC passed chip, "Aisha Rahman advanced this order from
  In production to QC passed", the note beneath it, and "Aisha Rahman · 18 Sep
  2026, 09:37" once — and the composer closed. Delivered `PO-2025-0001` read
  its heading as the green pill (`rgb(7, 141, 59)`) beside "· 0 days from
  order", with all six chips on the track. **No overflow at 768 and 1440**
  (768/768, 1440/1440) and the six-across stepper measured 670/670 and
  1070/1070; the phone drops to the vertical stepper with the same chips.
  **At 390 the page still overflows, 467 against 390** — the header's
  Download/Edit/Delete row, the defect recorded on 2026-09-18 at 479, not the
  stepper or the feed, which are inside the viewport at that width. Fixture
  stage event deleted by id and the stage and `stageChangedAt` restored;
  counts back to 2323 stage events and 400 POs. 1225/1225 tests (the feed's
  tests rewritten to the one-row shape, two added), `tsc`, lint (same 2
  warnings) and `npm run build` clean. **Not verified:** anything on
  production; a member's view (read as a super admin, and the feed is the same
  for every staff role); and the Note pill itself, which no stored record can
  produce today.
- 2026-09-18: "Print or save as PDF" removed; Download PDF is the only
  purchase-order action — merged from `fix/remove-print-po-button` and pushed.
  There was **one** such control in the app, `PrintOrderButton` on the buyer's
  order page (`/orders/[id]`); the admin PO detail, the shop-order review and
  the checkout review have never had one, checked by grep and in a browser.
  The component and its `window.print()` are deleted, and no print control
  replaced it. The `@media print` block in `globals.css` stays — it is not a
  control, and it is what makes a reader's own Ctrl-P print the document
  rather than the page's navigation; its comment now says so. **A consequence
  worth knowing:** an order with no stored file (placed before Phase 37, or
  one whose render failed) now shows no action at all, where Print used to
  cover it. Driven on development as a throwaway shop contact: on a fixture
  shop order with a real 4,129-byte PDF the only pill is Download PDF, its
  route answered 302 to R2 and the browser downloaded
  `W-2609-09980 purchase order.pdf` (4,129 bytes, `%PDF-1.3`); the viewer's
  −/100%/+/Fit is untouched; `/purchase-orders/[id]` and `/web-orders/[id]`
  as Aisha carry no print control, and PO detail keeps Download original. The
  production build contains no "Print or save as PDF" (0 matches). Fixture web
  order, its line, its `Document`, the R2 object (`NotFound`), the client and
  one login attempt deleted by id; counts back to users 2, `CLIENT` 0, web
  orders 0, documents 406, POs 400, stage events 2323, products 308, login
  attempts 68. 1223/1223 tests, `tsc`, lint (same 2 warnings) and build clean.
  Not verified on production, where the report came from.
- 2026-09-18: Notes and activity under the lifecycle, and stage sentences that
  name both stages — merged from `feature/po-lifecycle-feed` and pushed. Asked
  for as: put the notes and activity feed under the stepper, write "from X to
  Y" with the actor, and close the note composer on confirm. The old
  "Activity" card at the foot of `/purchase-orders/[id]` is now "Notes and
  activity" inside the lifecycle section, under the stepper: newest first (the
  order it always used), one row per event plus a row of its own for each
  note, each row carrying its type (Note / Activity), the stage it belongs to,
  the actor, the timestamp and the body. Every note is in the feed, whichever
  stage it was left on — the header caption used to show the latest one and no
  others, and no longer repeats it. No per-node filter; the whole feed is the
  view. Sentences come from a pure `src/lib/po-activity.ts`, reading the
  `fromStage` `PoStageEvent` has stored since Phase 05 rather than guessing
  from the stepper: "{actor} advanced this order from X to Y", "{actor} moved
  this order back from X to Y", "System placed the order", "{actor} edited
  {fields} on this order", "{actor} confirmed this order with a totals
  mismatch", "{actor} confirmed the order". The Advance popover is controlled
  now: Confirm closes it, a failed save keeps it open with the draft, and a
  new Cancel closes and discards (the Move back dialog's Cancel discards too).
  **A defect the browser found:** both handlers awaited the action with no
  try/catch, so an unreachable server left the button on "Advancing…" /
  "Moving back…", disabled for ever, with nothing said — the 2026-09-08 avatar
  defect again; both now toast "We couldn't reach the server. Try again." and
  reset in `finally`. Driven as Aisha on development against `PO-2026-0063`:
  advancing with a note closed the composer (0 textareas), toasted "Moved to
  QC passed" and put the activity and the note in the feed; an aborted POST
  kept the draft ("draft that must survive") and showed the error; Cancel
  discarded it; Move back closed its dialog and read "Aisha Rahman moved this
  order back from QC passed to In production"; `PO-2026-0025` reads "Aisha
  Rahman edited buyer reference on this order". Both fixture stage events
  deleted by id and the stage and `stageChangedAt` restored; counts back to
  2323 events and 400 POs. 1223/1223 tests (10 new on the sentences and the
  feed), `tsc`, lint (same 2 warnings) and build clean. **Not verified:**
  anything on production; a member's view (the feed is the same for every
  staff role, read as a super admin); the empty state, which no real purchase
  order can reach because the confirm row always exists. **Pre-existing, not
  fixed:** `/purchase-orders/[id]` still overflows at 390px — measured 479
  against 390, from the header's Download/Edit/Delete row, not the feed.
- 2026-09-18: Fix — the line under a purchase-order email's heading reads
  only "Order ID W-…" — merged from `fix/po-email-meta-order-id` and pushed.
  Asked for as: keep the Order ID, remove "· 3 lines · RM 200.00 · your PO
  number testingpo". The lines, total and the buyer's PO number stay in the
  order summary below; an email whose document data cannot be read no longer
  names the PO number at all. The props and selects that fed only that line
  were removed. 1213/1213 tests (one pins the line's text exactly), `tsc`,
  lint (same 2 warnings), build clean. Not re-rendered in a browser.
- 2026-09-18: Purchase-order emails show the order and a preview of the PDF —
  merged from `feature/po-email-preview` and pushed. Every email that carries
  or refers to a shop order (receipt, team notification, confirmed, delivery
  date moved, declined) now shows the Order ID and the buyer's PO number
  under the heading, the facts (buyer, order date, expected delivery or
  "We'll confirm", payment terms, currency, PO number), the lines (item with
  code, cartons, unit price, amount), subtotal/tax/total, page 1 of the PDF
  inline as `cid:po-preview`, a "Can't see the document?" line, and "This
  email is not an invoice." Shared pieces: `renderPoPreviewPng` (pdf.js +
  `@napi-rs/canvas`, 2x, null on failure or after 10s),
  `poEmailAttachments` (`W-….pdf`, and `W-…-preview.png` inline only when
  drawn) and `preparePoEmail` in `src/lib/po-email.ts`; `PoMetaLine`,
  `PoSummary`, `PoPreview`, `PoFooter` in `src/emails/po-parts.tsx`. The
  decline email now attaches the order as sent, read back from R2 and not
  redrawn. Team notification subject gained the Order ID. `pdfjs-dist`
  (pinned to react-pdf's 5.4.296) and `@napi-rs/canvas` became direct
  dependencies, external on the server and traced into `/shop/**`,
  `/web-orders/**` and `/purchase-orders/**`. Found on the way: React 19
  hoists a `<link rel="preload">` for any server-rendered `<img>` into
  `<head>` (`fetchPriority="low"` stops it; a test watched failing); the
  email card was a fixed-width table whose `max-width` browsers ignore, so
  no email ever shrank on a phone (measured 600 at 390, now 390); and no
  charset was declared. There are **no stage-move emails** (production, QC,
  warehouse, delivering, delivered) — none existed to upgrade, and none were
  added. Verified in a production build through a temporary probe route
  (deleted): preview 177ms cold / 53ms warm, 132 KB PNG beside a 4.4 KB PDF;
  all five emails rendered through `@react-email/render`, no preload, fit at
  390 and 700, and with images blocked still read the lines and total.
  1212/1212 tests, `tsc`, lint (same 2 warnings), build clean. **Not
  verified:** a real send or any mail client (Gmail, Outlook, Apple Mail),
  and the rasteriser on Vercel's linux runtime — the linux canvas binary is
  not installed locally, so only a deployed send proves it; a failure there
  degrades to HTML and the PDF.
- 2026-09-17: Fix — Order ID is not the PO number — on
  `fix/order-id-vs-po-number`, not yet committed. Reported as "W-2609-00014 is
  an Order ID, not a PO number". Cause: confirming a shop order copied its
  `WebOrder.reference` into `PurchaseOrder.poNumber`, and the PDF masthead and
  checkout preview printed the Order ID wherever the buyer gave no PO.
  Decisions the user made: an uploaded scan's Order ID is "—" (no new ID
  series), and the fix is a migration. `PurchaseOrder.poNumber` is now
  nullable and means the buyer's PO only; migration
  `20260919090000_po_number_not_order_id` copies a shop order's
  `buyerReference` onto its purchase order where missing and nulls `poNumber`
  **only where it equals the order's own W- reference**, so a number a
  reviewer typed before the lock survives. Not stored in `poNumber` for shop
  orders on purpose: the `(buyerId, poNumber, revision)` unique key would
  refuse a buyer reusing their own PO. `src/lib/order-identity.ts` resolves
  both (Order ID from the web order; PO from `poNumber`, or `buyerReference`
  on a shop order only — on a scan that column is the retired extraction
  field). Order ID and PO number are separate columns or fields on the
  purchase-order list and review queue (search matches both), PO detail and
  its edit sheet and delete dialog (types the Order ID where there is one),
  the shop-order confirm form and summary, product order history, the buyer's
  orders table ("Order ID", "Your PO number"), their order page, the sent
  page, both PDF/preview renderers ("Order ID W-…" under the title, a "PO
  Number" cell reading "—" when blank), both emails and the checkout hint.
  Single-identifier places (tab titles, breadcrumbs, activity lines, the
  dashboard's largest PO) say "Order ID W-…" or "PO number …". An upload's
  file name no longer stands in as its PO number; it shows beside the file
  badge instead. `confirmWebOrder` blanks any PO number a client sends.
  Driven on development with fixtures seeded in the **old** shape, then
  migrated: A (`poNumber` W-2609-09991, buyer PO FIX-PO-A) → null /
  FIX-PO-A; B (no buyer PO) → null / null; C (typed TYPED-PO-C) kept. List
  read `W-2609-09991 | FIX-PO-A`, `W-2609-09992 | —`, `W-2609-09993 |
  TYPED-PO-C`, queue `W-2609-09994 | FIX-PO-D`; searching either value found
  its row. Confirming D in the browser stored `poNumber` null and
  `buyerReference` FIX-PO-D; its redrawn PDF read "Order ID W-2609-09994" and
  "PO Number FIX-PO-D"; delete stayed disabled for FIX-PO-D and enabled for
  the Order ID. Buyer view: a scan row `— | PO-2026-0063` titled "PO number
  PO-2026-0063"; checkout preview "PO Number —", then the typed value. No
  overflow on the list at 390. Fixtures, one R2 object (NotFound) and a draft
  cart deleted by id; counts at baseline. 1197/1197 tests (20 new; four
  watched failing with the defect put back), `tsc`, lint (same 2 warnings),
  build clean. **Not verified on production**, where the migration runs on
  deploy; how many confirmed shop orders it rewrites there was not read.
- 2026-09-17: The document leads wherever a purchase order is previewed, and
  PO number and PO date are read-only — built and driven on
  `feature/po-document-primary`, not yet committed. `/web-orders/[id]`,
  `/purchase-orders/[id]` and `/review/[id]` put the PDF in a wide column
  (`grid-cols-document`: the rest of the width beside a 22rem rail, from `xl`,
  sticky), at up to the viewport's height (`--spacing-preview`); the confirm
  form / summary sit in the rail, and on `/review` the line items run full
  width underneath. PO detail's line items became a list to fit the rail. The
  shop's sheet (checkout review, buyer's order page) moved to the top and opens
  at Fit with −/+/Fit (`DocumentFit`, CSS `zoom`; print resets it). PO number
  and date are read-only on the shop-order confirm form, the PO edit sheet and
  `/review` — there only when both Claude's output and the draft hold the
  value, so a failed or thin extraction stays editable. UI only: the actions
  still accept both fields. Driven with fixtures (a real rendered PDF, three
  R2 copies): PDF 718px wide at 1440 (was 472), no cropping at 390/768/1440,
  zoom 125% then Fit, confirm and an edit-sheet save kept PO number and date;
  shop sheet 1070/678/308px at 1440/768/390, print hides controls at zoom 1.
  Fixtures deleted by id, R2 NotFound, counts at baseline. 1177/1177 tests,
  lint (same 2 warnings), build clean. **Found, not fixed:** PO detail at 390
  overflows 88px from the header's Download/Edit/Delete row (pre-existing).
- 2026-09-17: Fix — the success animation, and the review summary's lines —
  on `fix/success-lottie-and-summary-lines`. Reported as the animation "not
  showing" on production, where the file answered 200 on both hosts and plays
  1.5s to a green check. Two gaps in `SuccessMark` could hide it: reduced
  motion swapped it for the old grey check, and the player fetched its 1.2 MB
  wasm from jsdelivr, leaving an empty box when that stalled. The wasm is now
  bundled (`setWasmUrl` with `new URL(..., import.meta.url)`,
  `@lottiefiles/dotlottie-web` declared at 0.80.0), reduced motion holds the
  last frame, and an error or 4s without loading shows the checkmark. Driven
  on development: CDNs blocked → drawn from `/_next/static/media`; reduced
  motion → last frame (3,951 px painted, as at the end of playback); 404 →
  checkmark; a hung request → blank at 2s, checkmark by 5s. The shop order
  summary's lines drop the unit price and keep the line total
  (`AARA-HC-0400-AD · 5 cartons · 120 pieces · RM 912.00`). Fixture deleted by
  id; counts at baseline. 1177/1177 tests, lint and build clean. Which of the
  two gaps hid it on the user's machine was not established.
- 2026-09-17: Fix — preview builds no longer migrate production — on
  `fix/migrate-on-production-only`. Phase 47's deploy failed with P1002 on
  `pg_advisory_lock(72707369)`: the branch push and the `main` push, minutes
  apart, both ran `prisma migrate deploy` against production, because the
  dashboard's build command ran it for every environment (Phase 41's notes).
  `vercel.json` now sets `buildCommand` to run `migrate deploy` only when
  `VERCEL_ENV` is `production`; it overrides the dashboard's. The shell logic
  was checked with the commands stubbed: preview and development skip the
  migration, production runs it, a failing migration still fails the build.
  Not verified on Vercel itself until the next deploys. Production's log now
  shows `DIRECT_URL` on the non-pooled host; Preview's could not be read.
- 2026-09-17: Phase 47 — Expected delivery column, review-count ping, button
  and page motion, the shop's success animation and the shop order's PDF on
  its review page — built and driven on `feature/po-delivery-column-and-motion`
  (details under Status above). New dependency `@lottiefiles/dotlottie-react`;
  the proxy matcher skips `.lottie`. No migration.
- 2026-09-17: Expected delivery cannot be before the PO date when confirming a
  shop order, and on the confirmed-PO edit sheet — merged from
  `feature/delivery-not-before-po-date` and pushed.
  The delivery date input's `min` is the PO date (so the picker greys out
  earlier days, following the PO date when it changes), `Field` gained a `min`
  prop, a typed or stranded earlier date shows "Expected delivery can't be
  before the PO date." under the field on Confirm, and `confirmWebOrder`
  refuses it with the same words; the same day is allowed. Driven on
  development: min read 2026-09-17, then 2026-09-20 after the PO date moved;
  a typed 16 Sep was refused, a PO date moved past an 18 Sep delivery was
  refused, zero Server Action requests while invalid, and 20 Sep on a 20 Sep
  PO date confirmed. The picker's greyed days follow the browser's handling
  of `min` and were not screenshotted. **The edit sheet too**, at the user's
  "do it all": its delivery input's `min` follows the PO date, and
  `purchaseOrderPatchSchema` refuses an earlier delivery (a cleared one is
  still allowed) — checked first that no order on development holds one (0 of
  400 with a date), so no existing record is locked out. Driven on seeded
  `PO-2026-0025`: min 2026-01-30, a typed 29 Jan toasted the error and kept
  the sheet open, min moved to 2026-02-01 with the PO date, and the row read
  back unchanged (same `updatedAt`). Fixtures and sign-ins deleted by id;
  counts at baseline. 1175/1175 tests, `tsc`, lint and build clean. Not
  verified on production, where existing orders were not checked.
- 2026-09-17: The shop-order review drops its line inputs and total — on
  `feature/review-without-line-items`, merged to `main` and pushed. Asked for as "remove
  the part below tax, the line item below tax". `/web-orders/[id]`'s confirm
  form now ends at Tax, then Confirm order and Decline; the confirmed purchase
  order carries the buyer's lines exactly as sent, shown with their total in
  the left pane. The user first chose both review screens, then — told that on
  `/review/[id]` the line items sit above the totals and carry each line's
  product match, without which Confirm & save cannot unlock and a misread
  figure cannot be fixed — chose to leave uploaded purchase orders unchanged.
  Driven on development: the form's inputs read PO number, PO date, Expected
  delivery, Payment terms and Tax only, with no "Order total"; confirming a
  two-line fixture stored 3 × 157.50 = 472.50 and 4 × 236.25 = 945.00, total
  1,417.50, on the same two products. Fixture, purchase order, document, R2
  object (NotFound), client and sign-in deleted by id; counts at baseline.
  1170/1170 tests, `tsc`, lint and build clean. Not verified on production.
- 2026-09-17: The Receive step removed — merged from
  `feature/remove-receive-step` and pushed. A shop order goes straight from
  sent to confirmed: `/web-orders/[id]` shows Confirm order and Decline only,
  and `confirmWebOrder` accepts SUBMITTED, guarding its CONFIRMED write on
  whichever status it read. `receiveWebOrder`, its test and the
  `WebOrderReceived` email and its test were deleted at the user's request.
  **RECEIVED is still read everywhere** — the enum value, the Received badge
  in the review queue, the buyer's "Received by the team" and the step bar —
  because orders received before today still exist and still confirm; no
  migration. Driven on development: a sent fixture order showed only Back,
  Confirm order and Decline, and confirmed with 2 Oct 2026 straight from sent.
  Fixture, purchase order, document, R2 object (NotFound), client and its
  sign-in deleted by id; counts at baseline. 1170/1170 tests, `tsc`, lint and
  build clean. Not verified on production.
- 2026-09-17: Confirming a shop order requires payment terms as well as the
  expected delivery date, and says which is missing — on
  `feature/confirm-requires-delivery-and-terms`, merged to `main` and pushed. Until now
  Confirm sat greyed out with "Locked — set an expected delivery date" and
  payment terms could be left blank. Confirm is now pressable once the order
  is received and the totals agree; pressed with either field empty it shows
  "Set an expected delivery date." / "Enter the payment terms." under the
  field (linked by `aria-describedby`, `aria-invalid` set), a red line under
  the buttons, and focuses the first empty field, sending nothing.
  `confirmWebOrder` refuses blank or whitespace-only terms with "Payment terms
  are required."; uploaded purchase orders are unaffected (`confirm.test.ts`
  passes unchanged). Decline now returns to /purchase-orders rather than the
  "From the shop" chip, which holds confirmed orders only since Phase 46.
  Driven on development with a received fixture order: untouched form no red;
  Confirm with both empty → both messages, both inputs invalid, focus on the
  date; date filled → its message cleared, next press focused terms;
  whitespace terms refused; zero Server Action requests while blocked, one on
  the real confirm, which stored "30 days" and 2 Oct 2026. Fixture, purchase
  order, document, R2 object (NotFound), client, two login attempts (one left
  by the badge screenshots) deleted by id; counts at baseline, login attempts
  68. 1178/1178 tests, `tsc`, lint and build clean. Not verified on production.
- 2026-09-17: Phase 46 — the review queue, and its count in the sidebar —
  built, driven and merged from `feature/po-needs-review-section` (details under Status
  above). Everything waiting on the team moved from the purchase-order table
  to a section above it, and its count shows on Purchase Orders in the sidebar
  and the phone's Orders tab, kept current from the browser. No migration.
- 2026-09-17: Fix — the shop card's price ignored the selected flavour — on
  `fix/shop-card-variant-price`, merged to `main` and pushed. Reported as critical: Zen Garden Shower Cream
  2.1L CARROT is RM 10.00 and its siblings RM 5.00, and the catalogue card read
  "from RM 5.00" with CARROT selected. `ShopProductCard` printed the listing's
  cheapest price whenever flavours were priced apart, whatever was selected;
  the cart was never wrong, since Add to cart sends the selected product and
  the cart prices from it. The card now always prints the selected flavour's
  own price, and "from" is gone. A render test was watched failing first
  (RM 5.00 with a RM 10.00 flavour selected). Driven on development by pricing
  `ZEN-SC-1000-CR-MYDIN` at 420 against five siblings at 210: the desktop chips
  and the phone select both read RM 420.00 on Carrot and RM 210.00 on each
  other flavour, switching back and forth, and the carrot product page read
  RM 420.00; the price was restored to 210 (all six read back 210, no
  `ProductPrice` rows written). 1174/1174 tests, `tsc`, lint and build clean.
  Not verified on production, where the report came from.
- 2026-09-17: Phase 45 — the purchase order's quantity columns — built and
  merged from `feature/po-document-quantity-columns` (details under Status
  above). Five quantity columns replace the pack text line, the document goes
  landscape, and a note under the dates says the team will confirm delivery
  and terms until it does. No migration.
- 2026-09-17: Phase 44 — the purchase order's pack line and delivery cell —
  built and driven on `feature/po-document-pack-line` (details under Status
  above). Captions drop the "Variant:"/"Market:" labels, the pack line reads
  pieces/carton · cartons/pallet · pieces, and Expected delivery reads "—"
  until confirmed. No migration.
- 2026-09-17: Phase 43 — the shop backlog on top, and deleting from the list —
  built, driven and merged from `feature/po-list-backlog-and-delete` (details under
  Status above). A PO-date sort pins unconfirmed rows first; super admins
  delete confirmed and shop orders from the table with the reference typed
  back. Fixed `deletePurchaseOrder` stranding a confirmed shop order as
  CONFIRMED with no purchase order. No migration.
- 2026-09-17: Phase 42 — the purchase-order file — built and driven on
  `feature/po-document-revamp` (details under Status above). The document names
  ZEN GARDEN TRADING (M) SDN BHD, captions each line with its variant and
  market, groups every figure's thousands, drops the signature lines and the
  "Prepared for" caption, and loses "Delivery requested" everywhere. The stored
  PDF is now redrawn at confirm and when the date moves, and rides on both
  delivery-date emails. No migration.
- 2026-09-17: Phase 41 — receiving a shop order, and the Source column —
  built across thirteen tasks, merged from `feature/order-receipt` as
  `c983174` and deployed (spec `docs/specs/41-order-receipt-and-source.md`;
  details under Status above). A shop order runs `SUBMITTED → RECEIVED →
  CONFIRMED`, the buyer is emailed on receipt, and the purchase-order list
  gained a Source column, a Received chip and a chip-less `shop-open` filter
  for the dashboard. One additive migration. The admin notification email
  already existed and was not rebuilt. **Deploying found that preview builds
  migrate production**: the branch push applied the migration there before
  `main` was pushed. Before this phase, on 2026-09-16, the open-order cap on
  shop submission was removed at the user's request.
- 2026-09-14: Phases 31 and 32 — product variants, and review and send — built,
  verified and merged from `feature/product-variants` (specs
  `docs/specs/31-product-variants.md`, `docs/specs/32-order-review.md`).
  Variants: the shop went from **308 cards to 83**, 81 offering a choice,
  grouped on brand, name, pack size and market with the importer's
  `" — Variant"` suffix stripped; no migration. Proved by measurement — picking
  Papaya moved the card's link and stored that product's id, not the default.
  Two defects the browser found: card chips were 28px and scrolled inside the
  card, so phones get a 44px select; and `singleGroup` was exported from a
  `"use client"` module, which a server component may not call.
  Review and send: `/checkout/review` and `/checkout/sent/[reference]`, the
  cart stops sending, and `WebOrder.requestedDate` — a column that had existed
  since Phase 16 and that nothing ever wrote — is asked for and stored as the
  day picked (25 September, not the 24th). The client gets a receipt email,
  sent even when there is no ops staff to tell. Guards proved: another buyer's
  reference renders "Page not found" and leaks nothing.
- 2026-09-14: Phase 30 — Shop cart speed — built, verified, merged and
  deployed (spec `docs/specs/30-shop-cart-speed.md`). Four causes, measured:
  every stepper tap sat on `useAwaitableRefresh`'s 8 s give-up (8198 ms
  locally against a 0.6 s wire) because the refresh transition was entangled
  with the stepper's own pending action; every mutation rendered the route
  twice, since `revalidatePath` inside the action already renders it into the
  response; production functions ran in `iad1` while Neon is in
  `ap-southeast-1`; and the viewer was read twice per render. After: one
  request and 17 queries per tap instead of two and 28, stepper unlocked at
  280 ms, `vercel.json` pinned to `sin1`. Confirmed on production:
  `x-vercel-id` moved from `sin1::iad1::…` to `sin1::sin1::…` and guest page
  times roughly halved.
  **A deploy then failed with Prisma P1002**, and it was not transient.
  Production's `DIRECT_URL` points at the **pooled** Neon endpoint, so
  `prisma migrate deploy` takes its advisory lock through PgBouncer in
  transaction mode and the matching unlock is routed elsewhere — the lock is
  left held by a live pooled backend (seen: lock `72707369`, granted, pid
  idle, its last statement one of the shop's own queries) and every later
  build times out waiting for it. It clears when the backend recycles, which
  is why 2026-09-09 recorded it as transient. **Reproduced**: the retry
  succeeded and promptly orphaned a fresh lock. The permanent fix is to point
  `DIRECT_URL` at the non-pooled host, `ep-polished-wildflower-b3zeyn4i`
  without `-pooler`; the permission classifier blocked that change, so it is
  still outstanding. `.env.local` line 37 has the same inversion for
  development.
  **A mistake worth recording:** `vercel redeploy` on what looked like the
  newest deployment rebuilt one from three days earlier and Vercel aliased it
  to production, rolling the live site back past Phase 30 and dropping the
  region pin. Caught on the next header read and corrected with
  `vercel promote` on the right build. Use `vercel ls --prod` and read the
  Age column before redeploying anything.

- 2026-09-14: Phase 29 — Cartons per pallet — built, verified and merged
  from `feature/cartons-per-pallet` (spec `docs/specs/29-cartons-per-pallet.md`).
  `Product.cartonsPerPallet`, nullable, whole number above zero, one
  additive migration; a field on `/products/new` and in the edit drawer, a
  row on the product detail page and in the shop's product specs; the
  catalogue importer keeps the pallet note it had been parsing since Phase
  13; `scripts/backfill-cartons-per-pallet.ts` filled development from the
  labels file by exact SKU. Production untouched by the backfill.
- 2026-09-14: Phase 28 — the catalogue's vocabulary, and a product's life —
  built, verified and merged from `feature/catalogue-and-lifecycle` (spec
  `docs/specs/28-catalogue-and-product-lifecycle.md`). One additive migration,
  `20260914120000_catalog_labels`, whose backfill read the vocabulary out of
  the products that carried it: **18 brands, 88 variants, 9 markets, 9
  categories**, 124 rows.
  **The screen's counts were checked against the database, not against
  themselves** — "Aara · 9 products" and "Buddha · 3 products" matched
  `product.count()` exactly. Adding **"Brunei"** produced a market with *no*
  products that the next create's picker offered, which the old derived list
  could not express at all. Renaming **"Buddha" → "Buddha Therapy"** toasted
  "3 products updated" and the rows then read `Buddha Therapy` on all three
  SKUs and `Buddha` on none; it was renamed back the same way afterwards.
  Renaming "Aara" onto **"darce"** was refused — *"There is already a brand
  called “Darce”."* — so a list cannot fork on casing; Remove is disabled on a
  value in use and on **"Uncategorised"**, which the purchase-order intake
  writes verbatim.
  **A real member gets the room's 404 on the new route.** Signed in freshly as
  a `MEMBER` so the proxy read a token carrying that role, `/admin`,
  `/admin/buyers` and `/admin/catalogue` each answered **404** with "Page not
  found" and no vocabulary in the body.
  **Publish round-tripped on the shop's own wire**: `curl` on `shop.localhost`
  found a test product in the shop's search (1 hit), lost it after Unpublish
  (0 hits), and found it again after Publish (1 hit) — the pill and the toast
  moving with it. **Delete was refused and then done**: with one
  purchase-order line pointed at the product, the danger zone read "1
  purchase-order line references this product, so it can't be deleted.
  Unpublish it instead." with the button disabled; with the reference removed,
  Delete stayed disabled for a partial name and enabled for the name typed in
  the wrong case with spaces around it, and afterwards the row was `null`, its
  image and price rows gone by cascade, and **both R2 objects answered
  `NotFound`**.
  **Two pins watched failing first:** deleting the `updateMany` from
  `renameLabel` broke the rewrite test; disabling the reference check in
  `deleteProduct` broke the refusal test.
  **Sweep:** `/admin/catalogue`, `/products` and a product page at
  390/768/1440 — nine combinations, `scrollWidth === innerWidth` on all. Every
  Rename/Remove/Add control is 44×44 at 390. The catalog chip reads
  **Unpublished** while `?filter=inactive` still answers 200.
  **Cleanup, counted:** products **308**, `CatalogLabel` **124**, line items
  **1606**, purchase orders **400**, users **2** — the numbers this task
  started with, and `aisha@lovinghandsportal.com` read back as **MEMBER**. One
  label the task itself created (`MARKET "Malaysia"`, registered by its
  throwaway product because the create form defaults to it) was deleted by id
  after confirming no product used it.
  **Known, recorded rather than fixed:** merging two spellings is not one move
  — rename is refused onto an existing value, so products must be repointed
  first and the emptied value then removed. The customer's own variant list
  holds real duplicates ("Aloe Vera"/"Aloevera", "Anti Dandruff"/"Anti-
  Dandruff"); which spelling is right is theirs to say.
  **Not verified:** anything on production — the branch had never been
  deployed when this was written and the migration has not run there.
- 2026-09-14: Phase 27 — a product cannot exist without a picture — built,
  verified and merged from `feature/product-images-required` (spec
  `docs/specs/27-product-images-and-categories.md`). `/products/new` stages
  its images in the browser and **Create product** stays disabled until one
  is staged; the submit writes the row, then uploads the staged files against
  its new id, because presign hangs `ProductImage` rows on a `productId` that
  does not exist until then. `updateProduct` refuses a product with zero
  images — archive and the purchase-order intake path deliberately not gated.
  Category became a growing label seeded by `PRODUCT_CATEGORIES`, with
  `generateSku` falling back to the initials rule for one the table never had.
  **Proved with measurements, not adjectives.** Four files in one batch: two
  staged, `not-an-image.pdf` refused as "That file type isn't supported" and a
  6.0 MB file as "That image is 6.0 MB — the limit is 5.0 MB", the button
  moving from "Add at least one image" to "2 images ready". After Create: two
  `ProductImage` rows at positions **0** and **1**, cover = the first tile,
  both with a `thumbKey`, and the detail page's images decoding at **900×700**
  and **700×700** from R2 (read from `naturalWidth`). A typed category "Pet
  care" produced **`PC-0500-MY`**, then appeared in the catalog filter
  ("1 product") and in the next create's picker after the seeded nine.
  **The edit gate was read off the wire.** A disabled React button will not
  dispatch a click however the DOM is poked, so the drawer's own guard was
  removed for one run: the dev log shows `updateProduct(…)` reached and the
  toast read **"Add at least one image before saving changes."**, with the
  row's `updatedAt` unchanged across three attempts and Archive enabled
  throughout. The new test was watched failing with the `_count.images === 0`
  branch deleted. **The failure path was driven rather than argued**: with
  presign forced to 500, the product was created and the page stayed put —
  toast "Product created, but its images didn't upload", the tile carrying
  "We couldn't reach the server", the header offering "Open the product" —
  and that product then showed under the catalog's **Missing image** chip.
  **Two defects the browser found that the build could not.**
  `listLabels("category")` used `not: null` against a non-nullable column,
  which is a Prisma **runtime** error ("Argument `not` must not be null") that
  `tsc` and `npm run build` both passed while `/products/new` answered a
  server error; and the category picker offered a "No category" row that
  could not be honoured, since the schema refuses a blank — `GrowingListPicker`
  takes a `required` flag now.
  **Sweep:** `/products/new` (two tiles staged plus a rejected row),
  `/products` and a product detail page at 390/768/1440 — nine combinations,
  `scrollWidth === innerWidth` on all. Sub-44px at 390: only the accepted
  classes (`SkipLink`, the `sr-only` file input, the shadcn `Switch` at
  32×18). Console 0 errors, 0 warnings on a fresh load.
  **Cleanup, counted both ends:** both test products deleted by id with their
  four R2 objects, each key re-checked with `headObject` and answering
  **NotFound**; `product.count()` **308**, `productImage.count()` **0**,
  `productPrice.count()` **0**, `user.count()` **2**, the category list back
  to the eight in use, and `aisha@lovinghandsportal.com` — promoted for the
  pass — read back as **MEMBER**.
  **Known cost, accepted on purpose:** all ~308 imported products have no
  image, so each needs one before its next edit; and a synonym category
  ("Haircare" beside "Hair care") now splits a share-chart slice, where
  casing alone cannot.
  **Not verified:** anything on production — the merge deploys there, but no
  production database was read or written and no production journey was
  driven; the purchase-order intake path that creates image-less products was
  not re-driven (untouched by this phase's files).
- 2026-09-14: Phase 26 — Buyer management — built and verified on
  `feature/buyer-management` (spec `docs/specs/26-buyer-management.md`).
  The admin tabs read **User management** and **Buyer management**;
  `/admin/customers/*` answers **308** to `/admin/buyers/*` (both the bare
  path and a deep path, read with `curl`). Every "customer" in the admin
  room became "buyer" — components, queries, actions and tests renamed to
  match; the `CUSTOMER_*` enum values kept their database names on purpose.
  **`sendPasswordResetLink`** (`src/actions/reset-links.ts`) puts a one-time,
  30-minute link in a member's or a buyer contact's inbox from a visible
  pill on the user row and on the contact row; it awaits the send so the
  toast is honest, refuses Google-only and disabled accounts with a reason,
  and writes `RESET_LINK_SENT` (one additive migration,
  `20260914090000_reset_link_sent`). The new-buyer form asks for company
  name and the point of contact — name, email, optional phone — with
  address, terms and remark folded into an animated disclosure; the contact
  always becomes the CLIENT login with a handle derived from their email
  (`src/lib/username.ts`, suffixed past collisions inside the transaction).
  Motion is CSS only: `--animate-rise` plus a `stagger-N` utility, an
  expanding tab underline, a `grid-template-rows` disclosure — all inert
  under `prefers-reduced-motion` (`animationName: none`, measured).
  `@react-email/render` is now a real dependency.
  **Proved on the wire, as the shop contact.** A buyer created from
  `/admin/buyers/new` (contact `delivered@resend.dev`, Resend's own test
  inbox) got its invitation; the admin's reset link toasted "Reset link sent
  to delivered@resend.dev", opened on `shop.localhost` to "Set a new
  password", set one, then the same link answered "This link has expired";
  the new password signed in on the shop host with `role: CLIENT` and
  `mustChangePassword: false`. A second link was opened while the contact
  held a live shop session — the reset page rendered (200), not a `/shop`
  404 — and afterwards `POST /api/auth/callback/credentials` with the
  superseded password left no session while the new one produced
  `role: CLIENT`. A member's link was built on the portal host, a
  Google-only user's button was disabled carrying its reason, and the
  timeline read "Aisha Rahman sent Nadia Test a password-reset link".
  **Three defects found by the browser and fixed** (details in the spec §7):
  the post-reset redirect left the shop host for the portal, because
  Auth.js resolves `redirectTo` against its base URL — both password forms
  now assign a relative path themselves; the create form's title input was
  14px because the `Input` primitive's `md:text-sm` outranked the form's
  `sm:` size (inherited from Phase 23); and at 390px the new hero broke the
  buyer's name one letter per line while the contact row squeezed the name
  to "del…" — both stack below `sm` now, and the admin header hides its
  "Admin" eyebrow there so "Back to portal" fits on one line. The rise
  animation was switched from `both` to `backwards` fill after a row was
  seen holding an identity transform, which would make it the containing
  block for its sticky first cell (`transform: none`, `position: sticky`
  read back after).
  **Sweep:** `/admin`, `/admin/buyers`, `/admin/buyers/new` and a buyer page
  at 390/768/1440 — twelve combinations, `scrollWidth === innerWidth` on
  all after the fixes. Sub-44px at 390: card-mode title links (accepted
  class) and the activity strip's "All" segment at 39px wide — the compact
  segment look shared with every other strip — recorded, not fixed.
  **Cleanup, read back:** the test buyer was deleted through the danger
  zone itself (name typed case-insensitively, `buyer.count()` 12 → 11,
  `findUnique` null for both the buyer and the contact); this task's 8
  `AuditEvent` rows, 1 reset token and 5 `LoginAttempt` rows were deleted
  **by id**; counts returned to the baseline exactly — buyers 11, users 2,
  CLIENT 0, audits 0, tokens 0, attempts 60 — and `aisha@lovinghandsportal.com`
  was read back as `MEMBER` (promoted for the checks; its password is the
  seed default again). Two temporary scripts under `scripts/` and a
  temporary URL log line in the action were removed.
  **Two environment gotchas:** the dev server hit a Turbopack panic after
  the directory rename and, later, served stale server-component HTML while
  the client bundle had updated (a hydration-mismatch overlay was the
  symptom, as on 2026-09-08) — `rm -rf .next` and a restart cleared both.
  **Not verified:** anything on production; the temporary-password
  invitation email's delivery (Resend accepted it; the inbox is Resend's);
  the public forgot-password form's own post-reset redirect on the shop
  host, which the same fix should now cover but was not driven.
- 2026-09-13: Phase 25 — Admin › Customers — built across twelve tasks and
  verified end to end by Task 13 on `feature/admin-customers` (spec
  `docs/specs/25-admin-customers.md`). A super admin now creates, edits and
  deletes a customer, resets or removes a shop contact, and reads a merged
  activity timeline — sign-ins, shop orders, purchase orders and admin
  changes — from `/admin/customers`, `/admin/customers/new` and
  `/admin/customers/[id]`. Behind it: `AuditEvent`, written inside the
  transaction of every customer mutation and on every successful client
  sign-in.
  **The database baseline held exactly, both ends, read back rather than
  trusted.** Before: 11 buyers, 2 users (1 `SUPER_ADMIN`, 1 `MEMBER`), 0
  `CLIENT` rows, 0 `AuditEvent` rows, 58 `LoginAttempt` rows, 0 `WebOrder`
  rows. After a full customer-lifecycle journey — two test customers created,
  three password resets, an invite, a real shop order, a disable, two
  contact removals (one refused, one that succeeded) and a full buyer
  delete — every number returned to the same reading: `buyer.count()` **11**,
  `user.count()` **2** (`aisha@lovinghandsportal.com` back to `MEMBER`, read
  back rather than trusted on the update's return value), `user.count({role:
  CLIENT})` **0**, `auditEvent.count()` **0** (14 rows deleted **by id,
  collected as you go**, never by a wildcard — the brief's own rule, because
  a deleted test buyer's audit rows carry `buyerId: null` via `SetNull` and
  cannot be traced to it afterward), `webOrder.count()` **0**.
  **`LoginAttempt`: the excess this task itself created was cleared, the
  pre-existing gap above the historical 52 was not.** Six rows from the test
  contacts' own sign-ins and two from this task's own extra `aisha` sign-ins
  (66 total mid-task) were deleted by id; the count returned to **58**, the
  number this task started at and was asked to return to. The six-row gap
  between 58 and the "historical 52" the brief mentioned predates this task
  and was left alone — deleting rows this task did not create would be
  guessing which are safe to remove.
  **Criterion 1 does not hold the way it was written, and the spec was
  corrected rather than the finding buried.** A `MEMBER` gets a real 404 off
  the wire on `/admin`, `/admin/customers` and `/admin/customers/<id>` alike
  — measured directly with `curl -o /dev/null -w '%{http_code}'`, all three
  `404`. But `GET /admin/customers/does-not-exist` as the signed-in super
  admin answers **200**, not 404 — the same app-wide streaming-layout gap
  already recorded for `/products/[id]` (2026-09-10) and equally true of
  `/buyers/[id]` and `/purchase-orders/[id]`; `notFound()` sits correctly
  outside any try/catch, and the body contains "Page not found" and nothing
  of a real customer's, so the gap is in *status*, not *content*. §8
  criterion 1 now says exactly this rather than claiming a clean pass.
  **Criterion 7's pin was watched catching its own removal, not assumed to.**
  The `audit(tx, { action: "CUSTOMER_CREATED", ... })` call inside
  `createCustomer` was deleted, `npx vitest run src/actions/customers.test.ts
  -t "records the creation against the new buyer"` failed with `expected
  "vi.fn()" to be called 1 times, but got 0 times`, and restoring the call
  made it pass again. `src/actions/customers.ts` carries no diff afterward.
  **The password-reset and old-password-fails proof ran on the real wire, not
  the toast.** A contact's temporary password was reset three times in a row;
  each time `mustChangePassword` came back `true` and `sessionVersion`
  incremented (0 → 1 → 2 in the reads), and the contact signed in with the
  *second* reset's password, changed it to one of their own choosing on
  `/account/password`, and — after a *third* admin reset superseded it —
  `POST /api/auth/callback/credentials` on the shop host with the now-old
  (second) password returned `302` to
  `/signin?error=CredentialsSignin&code=credentials`, while the third reset's
  password signed in cleanly (`role: CLIENT`, session cookie set). Getting the
  plaintext password required an environmental workaround, recorded below.
  **Remove and Disable, both proven with real counts.** A contact with no
  orders was removed: `user.count()` **3 → 2**, `CONTACT_REMOVED` audit row
  with `subjectUserId` blank (`SET NULL`) and `{name, email}` in `detail` —
  no password. A second contact placed a real shop order first (`W-2609-00008`,
  `RM 210.00`, `SUBMITTED`, via the actual cart → checkout flow, not a
  fixture), then Remove was refused with the exact wording
  `"SDD Order Contact placed 1 shop order, so their account stays. Disable it
  instead."`, the button itself relabelling to **Disable instead**; clicking
  it set `disabledAt` and bumped `sessionVersion`, and `CONTACT_DISABLED` was
  written. **Delete customer, both ways, with the real counts a reviewer
  could check against the roster.** On Acme Industrial Sdn Bhd (63 purchase
  orders) the danger zone read "63 purchase orders reference this customer,
  so it can't be deleted" with the button disabled — not touched, read-only.
  On the test buyer with its one shop order, the same danger zone named "1
  shop order" and disabled the button; after the order was cleared and the
  contact re-enabled, typing the buyer's exact name enabled Delete, and
  `buyer.count()` went **12 → 11**, `user.count({role: CLIENT})` **1 → 0**,
  the buyer row itself confirmed gone (`findUnique` → `null`), and
  `CUSTOMER_DELETED` survived with `buyerId: null` and
  `{name, contacts: 1}` in `detail`.
  **A defect the sweep found and fixed, not deferred.** At 390px, a customer
  with a shop contact overflowed the page by 13px
  (`scrollWidth: 403` against `innerWidth: 390`) — new, not on the
  2026-09-11 accepted list. Traced to the one thing this phase's page does
  that `/buyers/[id]` never did: it puts `BuyerDetailsCard` and
  `BuyerContactsCard` **beside each other** in one `grid gap-lg
  lg:grid-cols-2`, where the portal page gives the contacts card a full-width
  row of its own. Neither card had ever had to shrink below its content's
  natural width before, and a grid item's default `min-width: auto` refused
  to let it. Wrapping each card in its own `min-w-0` div fixed it —
  re-measured at 390 → `390 = 390`. The full sweep, all clean after the fix:
  `/admin/customers`, `/admin/customers/new`, `/admin/customers/[id]` (both
  a buyer with a shop contact and Acme's 63-order page) and `/buyers`, each
  at 390/768/1440 — twelve combinations. The 390px sub-44px probe on the
  customer page (with a contact, an overflow menu, and a disabled danger-zone
  button all present) returned **zero** elements under 44px — no new
  accepted-list entry needed.
  `shop-viewer.test.ts` passed unchanged (5/5). `git diff` against `main`
  shows one storefront file (`shop/layout.tsx`) — that is Phase 24's own
  change, still unmerged to `main`; diffed against this branch's real parent,
  `feature/org-settings`, `src/lib/shop-viewer.ts` and every file under
  `src/app/(storefront)` show **zero** difference, which is the comparison
  that actually answers whether *this* phase touched the shop.
  **The comment `src/lib/auth.ts` carried since Task 5 was wrong, and is
  fixed.** It said a fire-and-forget `recordClientSignIn` call gets "the same
  treatment as `touchLastActive`" — but `touchLastActive` **is** awaited at
  its own call site in the `jwt` callback. The real equivalence, now what the
  comment says, is that both swallow their own errors internally.
  **An environmental blocker, found, worked around for testing, and left for
  the user to fix for real.** `sendInviteEmail` failed on every attempt with
  "Failed to render React component. Make sure to install
  `@react-email/render` or `@react-email/components`" — not a code defect:
  `resend`'s `emails.send()` treats `@react-email/render` as an *optional*
  peer dependency, nothing in this project's own `package.json` names it
  directly, and `package-lock.json` has no top-level entry for it at all, so
  `node -e "require.resolve('@react-email/render')"` fails on a plain
  `npm install` from the committed lockfile — reproducible on any fresh
  clone, not particular to this machine. `npm install --no-save
  @react-email/render@2.0.6` (no `package.json`/`package-lock.json` change,
  confirmed by `git diff --stat` afterward) unblocked local testing for this
  task only. Once installed, a real send correctly reached Resend's API and
  was correctly rejected by *Resend itself* — `422`, "Invalid `to` field.
  Please use our testing email address instead of domains like `example.com`"
  — since every test contact's address was `@example.com`; `resetClientPassword`
  still wrote `mustChangePassword`/`sessionVersion` regardless, matching the
  documented "a failed send must not read as a failed action" contract. The
  actual plaintext passwords used in the sign-in proof above were read via a
  one-line `console.log` temporarily added to `sendInviteEmail` and removed
  with `git checkout` immediately after each use (`git diff` empty both
  times, verified). **Not fixed**: adding `@react-email/render` as a real
  dependency is a `package.json` change outside this task's two-file scope;
  until it lands, a fresh `npm install` on this branch cannot send a real
  email locally.
  **Verification: 780/780 tests, `tsc --noEmit`, `npm run lint` (2
  pre-existing warnings in files this task did not touch, 0 errors) and
  `npm run build` all clean.**
  **Not verified:** anything on production — this branch has never been
  deployed, and no production database was read or written. `updateBuyer`
  and `updateBuyerContact`'s own `AuditEvent` writes were not exercised live
  in this task (criterion 7's test-removal pin covers their correctness
  structurally; Steps 3–4's actual audit trail covers `CUSTOMER_CREATED`,
  `PASSWORD_RESET`, `CONTACT_REMOVED`, `CONTACT_INVITED`, `CONTACT_DISABLED`
  and `CUSTOMER_DELETED`). The eighteen deferred minors accumulated across
  the twelve build tasks (`.superpowers/sdd/2026-09-13-admin-customers/progress.md`)
  were read and left as recorded — none was in scope to fix beyond the
  `auth.ts` comment and the 390px grid overflow above. A second, whole-branch
  review runs after this task; nothing here should be read as that review's
  substitute.
- 2026-09-11: Phase 24 — organisation settings — built and verified across
  four tasks on `feature/org-settings` (spec `docs/specs/24-org-settings.md`,
  plan `docs/specs/plans/2026-09-11-org-settings.md`). The supplier contact
  details the public shop footer and account menu print — name, email, phone,
  address — move out of the four `SUPPLIER_*` env vars and into a database row
  a super admin edits from `/admin`, falling back **per field** to the env var
  where a field is unset.
  **The row really is a singleton, seen to be refused rather than assumed.**
  `OrgSettings` carries an `id` defaulting to `"singleton"` and a CHECK
  constraint naming it. Task 1 proved it by writing the first row, then
  attempting a second with `id: "other"`: Postgres refused it with **SQLSTATE
  23514**, the message naming the constraint exactly —
  `new row for relation "OrgSettings" violates check constraint
  "OrgSettings_singleton"`. The table was left empty afterward for Task 2's
  tests and Task 3's browser checks to start clean.
  **The fallback resolves per field, not per row, and this was checked two
  ways rather than argued once.** A per-row rule — "is there a settings row?
  then use it, else use env" — would blank a phone still living in an env var
  the moment someone saved only the email, which is exactly the failure the
  spec's acceptance criterion 2 names. First, the reviewer ran the
  counterfactual deliberately: rewriting `loadSupplierDetails` as a per-row
  ternary made the suite fail on the stored-email/env-phone case with
  `expected null to be '+60 3-0000 0000'`, and reverting made it pass again —
  the same counterfactual run against `revalidatePath` (browser-relative paths
  in place of `shopPath`'s resolved ones) also failed as expected. Second, and
  the one that matters more because it is not a unit test asserting its own
  mock: Task 3 exported `SUPPLIER_PHONE="+60 3-0000 0000"`, saved only the
  email (`orders@lovinghands.my`) from `/admin`, and loaded the shop footer as
  a guest. Both values rendered **in the same paint** — the stored email next
  to the env-sourced phone — while `prisma.orgSettings.findUnique` confirmed
  `supplierPhone: null` in the database throughout. One field came from the
  row, its sibling from the environment, on one request.
  **A change reaches the public shop with no redeploy and no restart — the
  reason the phase exists — read from a real link, not from visible text.**
  With the same `npm run dev` process running the whole time (no restart, no
  build), Task 3 saved an email in `/admin`, then signed in as a client on
  `shop.localhost`, opened the account menu, and read the "Talk to our team"
  row's actual `href` via `browser_evaluate`: **`mailto:orders@lovinghands.my`**
  — the value just saved, not a stale build artefact. The guest-facing footer
  showed the same value on a plain page load, no session at all.
  **`ShopFooter` stopped reading `env` directly.** It now takes a
  `supplier: SupplierDetails` prop; `src/app/(storefront)/shop/layout.tsx` is
  the one place that resolves `loadSupplierDetails()` and passes the result to
  both `ShopFooter` and `ShopHeader`'s account menu, so the two can never read
  two different snapshots of the same values in one request. A grep after the
  branch's three feature commits found exactly one remaining
  `env.SUPPLIER_*` read outside `env.ts`'s own schema and the generated Prisma
  client's doc comments: `src/lib/org-settings.ts`, the resolver itself. No
  component reads the env var directly anywhere else.
  **A recorded deviation, not an oversight.** The card sits on `/admin` under
  that page's existing `h1` ("Users") and eyebrow ("Access"), neither of which
  describes it, with its own `h2` ("Contact details") and caption ("These
  appear on your public shop."). The alternative — a second admin route for
  four fields — is more chrome than they earn today. `/admin/settings` earns
  its own page **when a third kind of setting arrives**; until then this is
  the stated trade, not a thing nobody noticed.
  **The final review caught a caption that was not true, and it was fixed
  rather than shipped.** The card says "These appear on your public shop", and
  `supplierName` appeared nowhere: `SUPPLIER_NAME` has been declared in
  `env.ts` since Phase 17 and read by nothing, so the new card inherited a
  field that edited a value with no reader. It is now the first row of the
  footer's contact column — name, then phone, then email, then address, which
  is how an address block reads — omitted when unset like every row beside it.
  Verified on the wire rather than by eye: with `SUPPLIER_NAME` exported and no
  database row, the rendered footer carried `Kim Brothers Sdn Bhd`; with
  `supplierName: "STORED NAME WINS"` in the row, it carried that instead **and
  still carried the env phone beside it**, so the per-field fallback holds for
  the new field too. `SETUP-CHECKLIST.md`'s line for the key was corrected in
  the same pass — it claimed the name "displays alone in the footer and as the
  link text in the account menu", and neither half had ever been true.
  **Two environment gotchas Task 3 hit, diagnosed, and are worth not
  re-deriving.** First, a `shop.localhost` navigation came back redirected to
  the portal host even after signing out on `localhost` — indistinguishable
  from the 2026-09-10 Chrome/`shop.localhost` connection-refusal bug from the
  outside, but a different cause: `page.context().cookies()` showed
  `shop.localhost` was still carrying its own `authjs.session-token`, a
  leftover from earlier phases' cross-host verification sitting in the shared
  persistent browser profile — cookies are genuinely host-only, so signing out
  on `localhost` cannot touch it. Fixed with `context.clearCookies()` plus
  re-adding the non-`shop.localhost` cookies; a guest then reached the shop
  cleanly. Second, typing an invalid email (`nope`) into the card's `Email`
  field and clicking Save produced **no `POST` at all** in the server log —
  the `<Input type="email">`'s native HTML5 validation intercepted the
  submission before React's `onSubmit` ever ran, confirmed via
  `el.validity.valid === false` and its `validationMessage`. The typed value
  stayed in the field and the database row was untouched (`updatedAt`
  unchanged). The server-side Zod rejection (`supplierPatchSchema`, message
  "Enter a valid email address.") is real and independently verified by
  calling it directly, but is effectively unreachable through a normal browser
  session — the native check always intercepts first.
  **Task 4's own cleanup, counted before and after.** `OrgSettings` held one
  row left over from Task 3's numbered checks — `supplierEmail: null`,
  `supplierPhone: null`, `supplierAddress` set to a three-line test address,
  `supplierName: null` — test values (`orders@lovinghands.my` had already been
  cleared in check 6; the address was the last successful save) rather than
  the real business's details. Deleted rather than kept: a fresh clone's first
  `npm run dev` should show the env fallback or "Not set", not a stray test
  address nobody entered on purpose. `orgSettings.count()` **1 → 0**.
  `aisha@lovinghandsportal.com`, promoted `MEMBER` → `SUPER_ADMIN` in Task 3
  for its own browser checks, was reverted and **read back** rather than
  trusted on the update's return value: `SUPER_ADMIN` → `MEMBER`, confirmed.
  `user.count()` held at **2** throughout (both super admins, no throwaway
  account survived — Task 3 already deleted its own two), `user.count({role:
  'CLIENT'})` **0** throughout, `buyer.count()` **11** throughout, matching the
  documented baseline. `git status` was clean before this task's own doc edits
  and shows only `.env.example` and `docs/specs/SETUP-CHECKLIST.md` changed
  afterward; `.env.local` untouched (`git diff --stat -- .env.local` empty).
  **The full sweep, six combinations, all clean.** `/admin` and the shop home
  at 390/768/1440 all measured `document.documentElement.scrollWidth ===
  window.innerWidth` — no exceptions. At 390, every interactive element inside
  the Contact details card cleared the 44px floor: the three text inputs and
  the address textarea were 44px/44px/44px/90px tall, Save was 52px tall — no
  sub-44px control in the new card.
  **Verification: 710/710 tests, `tsc`, lint (2 pre-existing warnings in files
  this branch never touched, 0 errors) and `build` all clean.**
  **Not verified:** anything on production — this branch has never been
  deployed and no production database was read or written. Phase 19's
  purchase-order PDF, which the spec says will also print these fields, is not
  built yet, so that read site does not exist to check. Concurrent saves to
  the singleton row (two super admins racing a save) were not exercised beyond
  what the `upsert` shape implies. The env-var path itself (a deployment with
  no `OrgSettings` row at all) was exercised locally by Task 3's `SUPPLIER_PHONE`
  check, not against a real preview deployment.
- 2026-09-11: Phase 23 — customer profiles — built and verified across six
  tasks on `feature/customer-profiles` (spec `docs/specs/23-customer-profiles.md`,
  plan `docs/specs/plans/2026-09-11-customer-profiles.md`). **Not merged —
  stopped for the user's own review**, per the plan's own final step. Three
  columns (`Buyer.remark`, `User.username`, `User.phone`) in one migration,
  `20260911090000_customer_profiles`; **`username` is a display handle shown in
  ops and, from Phase 21, on the customer's own settings screen, and is never a
  credential** — nothing in the sign-in path looks it up, pinned by a test.
  `/buyers/new` creates a customer — company, contact, an internal remark and
  an optional shop login — in one screen and one action; the remark and a
  buyer's contacts can be edited afterward; a customer can change their shop
  password more than once, closing the loop the Phase 15 invitation email
  opens.
  **The leak assertion, and it was seen to fail before it was trusted to
  pass.** `Buyer.remark` is internal and a shop page reads a `Buyer` in exactly
  one place — `loadShopViewer` (`src/lib/shop-viewer.ts:24`), which supplies
  the company name to the shop header and account menu. `notifyOps` and
  `loadWebOrderForReview` look like the same kind of read and are not: the
  first composes an email to ops staff, the second feeds the ops review
  screen, which already selects `notes` on purpose — neither renders to a
  customer, so neither got an assertion. `shop-viewer.test.ts` now asserts
  `select.buyer` equals `{ select: { name: true } }` by equality, not subset,
  so widening it later has to be a deliberate edit to that one line.
  **Confirmed to actually catch a leak, not just to exist**: with the test
  passing, `remark: true` was added to the shop-facing `select` — the test
  failed, printing the added key in the diff — then `git checkout --
  src/lib/shop-viewer.ts` reverted it and the same run passed again.
  **A defect the browser found that the unit tests passed over.**
  `uniqueMessage` read `meta.target` for a Postgres unique-violation message,
  but Prisma 7's driver adapter emits
  `meta.driverAdapterError.cause.constraint.fields` (with
  `cause.originalMessage` naming the constraint, e.g. `Buyer_name_key`) — a
  shape the original unit tests never saw, because they hand-built the flat
  `{ target: [...] }` object their own mocks expected. Every real duplicate
  therefore fell through to the generic "Something about that customer is
  already in use." Reproduced against a real P2002 on the development
  database and fixed to read the driver-adapter shape (falling back to the
  flat one for any caller Prisma didn't route through the adapter); all three
  collisions — `Buyer_name_key`, `User_username_key`, `User_email_key` — now
  return their own message, verified live in a browser as "Another customer
  already has that name.", "That username is taken." and "That email address
  is already in use." respectively.
  **The second latent defect: a partial patch could not be saved at all.**
  `buyerPatchSchema`'s `emptyToNull` fields (contactName, email, phone,
  address, paymentTerms, remark) were nullable but not optional, so a patch
  naming only `{ remark: "…" }` failed validation before ever reaching
  `updateBuyer` — every one-field edit on the buyer details card would have
  been rejected. The shared `emptyToNull` builder was made `.optional()`, and
  the fix was verified rather than trusted on the report alone: an omitted key
  is absent from `parsed.data` entirely (`hasOwnProperty` false), so
  `updateBuyer`'s spread never sends it to Prisma and a partial patch touches
  only the fields it names — the same data-loss class the uniqueMessage
  investigation was already watching for, checked and ruled safe.
  **A third defect, found by the final whole-branch review after everything
  else had passed: the screen said an invitation was sent when none was.**
  `src/lib/email.ts` is documented "Never throws" — it returns
  `{ sent: boolean }`, and a Resend API error, a bad recipient, a network
  failure and the placeholder-key case local runs hit all resolve
  `{ sent: false }`. `sendInviteEmail` awaited it and returned `true`
  regardless, so `createCustomer` reported `invite: "sent"` and `/buyers/new`
  toasted "Customer created and invitation sent." while the mail sat in no
  outbox — ops would have told the customer to check an inbox that stays
  empty. Acceptance criterion 2 was false for the whole build until this was
  fixed. **Both things that were supposed to prove that path exercised a
  contract the code cannot produce**: the unit test used
  `sendEmail.mockRejectedValue`, and the browser proof forced the failure by
  editing `email.ts` to throw. That is the third test on this branch to pass
  by asserting its own mock rather than the real contract — after the
  `meta.target` shape above, and the same class as Phase 16's vacuous
  `deletePurchaseOrder` call. The helper now returns `sendEmail`'s own `sent`
  and keeps its try/catch only as a fail-closed backstop; the new test
  resolves `{ sent: false }`, was watched failing against the unfixed code
  (`invite: "sent"` where `"failed"` was expected), and asserts the `Buyer`
  and `User` rows survive rather than only checking the returned string.
  **Left alone deliberately:** `inviteBuyerContact` and `resendClientInvite`
  still ignore the send result and toast "Invite sent." either way. That is
  pre-existing behaviour this branch did not introduce, and what those toasts
  should say is a product decision rather than a defect to fix in passing.
  **The password loop was driven end to end and the stale password's failure
  was read from the wire.** A customer invited from `/buyers/new`, signed in
  with the temporary password, was forced to `/account/password`, changed it,
  and the *old* password's next sign-in attempt did not merely toast an
  error — `POST /api/auth/callback/credentials` itself returned 200 with
  `error=CredentialsSignin&code=credentials` in the body, read directly rather
  than inferred from the UI. The new password then signed in cleanly from the
  shop host's own account menu, which now carries a working "Change password"
  row where Phase 15 left only *My orders*, *Talk to our team* and *Sign out*.
  **The 2026-09-10 `shop.localhost` Chrome issue recurred**, in this same
  checkout, across more than one of the six tasks: Chrome refused every
  connection to `shop.localhost` while `curl` on the same machine reached it
  instantly. The same recorded workaround was used again — a shell-exported
  `SHOP_HOST`/`SHOP_URL` pointing the browser at `foo.localhost` against the
  identical running server, confirmed behaviourally identical by `curl` first,
  no file changed, nothing committed.
  **The overflow sweep — nine combinations, all clean.** `/buyers`,
  `/buyers/new` and a buyer detail page carrying a remark and two contacts (set
  up directly against the development database for the sweep, since no
  existing buyer had either, and removed afterward) were each measured at
  390/768/1440: `document.documentElement.scrollWidth === window.innerWidth`
  on all nine. At 390 the only sub-44px interactive elements were the
  already-accepted classes — the `SkipLink` (visually off-canvas until
  keyboard focus, not a touch target at rest) and plain-text row links (buyer
  names, PO numbers) inside `DataTable` card mode, the same category named
  "product names, footer rows" in the 2026-09-10 entry. **One new
  finding, not on that accepted list**: `/buyers/new`'s "Give them a shop
  login" control is the shared shadcn `Switch` (`src/components/ui/switch.tsx`,
  already used by `ProductForm`, `ProductSheet` and `UserDrawer`) at 32×18px
  visually — its `after:-inset-x-3 after:-inset-y-2` hit-area padding brings
  the effective target to roughly 56×34px, still short of the 44px floor this
  spec's own global constraints name. It predates this phase and was not
  introduced by anything in these six tasks' diffs, so it was left unfixed —
  Task 6's own file scope is `shop-viewer.test.ts` and this file — and is
  flagged here rather than silently folded into the accepted list, per the
  brief's own rule that a new one is a defect to record as found, not to wave
  through.
  **Four deferred minors, carried forward rather than fixed:** an unused
  `username` in a destructure lint-warns in **two** files, not one —
  `src/actions/clients.test.ts:145` and `src/lib/validation/clients.test.ts:57`
  — both from the plan's own verbatim test code (warns, does not fail);
  `uniqueMessage`'s generic fallback still stands for a P2002 that carries
  neither shape; `/buyers/new`'s submit button keeps "Create customer" while
  pending rather than switching to "Creating…" as `ProductForm` does; and
  while a shop contact is being edited, its status text and Resend/Disable
  buttons are hidden along with the caption, not just the caption alone.
  **Verification: 688/688 tests (687 plus the one leak assertion), `tsc`,
  lint (2 pre-existing warnings, 0 errors) and `build` all clean.**
  **Cleanup, counted before and after**: `buyer.count()` 11 → 11,
  `user.count()` 2 → 2, `user.count({ role: 'CLIENT' })` 0 throughout,
  `webOrder.count()` 0 throughout — all five earlier tasks' own test data was
  already gone when this task started, verified independently rather than
  trusted. `aisha@lovinghandsportal.com`, promoted `MEMBER` → `SUPER_ADMIN` in
  Task 3 for its own browser checks, was read back as `SUPER_ADMIN` and
  reverted to `MEMBER`, confirmed by re-reading the row. This task's own sweep
  fixture (Northwind Traders' remark, two `CLIENT` contacts) and the one
  `LoginAttempt` row its own sign-in produced were all removed, `loginAttempts`
  returning to the pre-existing 52.
  **Not verified:** anything on production — this branch has never been
  deployed and no production database was touched. The ops upload → extract →
  confirm write path is untouched by this branch's files and was not
  exercised. Phase 21 (`docs/specs/design/shop/21-customer-settings.md`), the
  customer's own settings screen, stays out of scope here as the spec says —
  the password-change row added to the shop account menu is the one piece of
  that screen this phase needed.
- 2026-09-10: Phase 17 — shop shell and guest browsing — built, verified end to
  end and merged (`feature/shop-shell`, spec `docs/specs/design/shop/17-shop-shell.md`).
  **The shop is public now.** A guest reaches `/`, `/products`, a product page
  and `/cart` on the shop host with no session and all four render — read from
  the wire, not the browser: `curl` against `shop.localhost` returned 200 on
  all four, `/orders` came back 307 to `/signin?next=%2Forders`, and the same
  guest hitting `/shop` on the *portal* host got 307 to
  `/signin?next=%2Fshop` — not a literal 404. That last reading is not a
  regression: Task 3 recorded the identical finding when this phase started —
  an unauthenticated request never reaches the pinned-404 branch in
  `src/proxy.ts`, because it returns from the earlier `!session?.user` guard
  first. The 404 is real, but it is the *signed-in staff* case; acceptance
  criterion 1's "genuine 404" holds for a member's session, not a guest's, and
  that half of the proxy is unchanged since Task 3.
  **Known, not fixed — the same status gap, on a product page, measured
  directly.** A hidden or nonexistent product also answers 200 rather than
  404: `GET /products/<an inactive product id>` and
  `GET /products/does-not-exist` both returned HTTP 200, both bodies
  containing "Page not found"/"404", and **zero** occurrences of the hidden
  product's own name (`ZEN ROLL ON — Sportz`) in either — nothing leaks, only
  the status is wrong. This is app-wide and structural to the streaming
  layout — a nonexistent id behaves identically to a hidden one — not
  introduced by this phase. Acceptance criterion 1's "genuine 404" therefore
  holds on content everywhere and on status only for the signed-in-staff
  `/shop` case above; a product page never returns a real 404 status,
  hidden or not.
  **The cart stores product ids and cartons and never a price — measured, not
  assumed.** Three real catalogue products were added as a guest (one from a
  product card, one from a product page's buy box stepped to 2 cartons, one
  from a second card): the header badge read "3 products in your cart", `/cart`
  showed 3 products · 4 cartons, and the three line amounts — RM 210.00,
  RM 420.00, RM 496.80 — summed to the summary and the total exactly,
  RM 1,126.80. `localStorage["lh-shop-cart"]` read verbatim was
  `{"v":1,"lines":[{"productId":"…","cartons":1},{"productId":"…","cartons":2},{"productId":"…","cartons":1}]}`
  — ids and cartons, nothing else, no unit price and no line amount anywhere
  in it. (The stale-price replacement itself — a live RM 210.00 → RM 349.90
  edit in ops reflected on reload with no trace of the old figure — is Task
  11's own measurement, not re-run in this task; nothing in the commits
  since then touches cart pricing.)
  **The merge was proven with a row count, twice.** Signed in as the test
  client with that guest cart still in `localStorage`: the account's `DRAFT`
  `WebOrder` landed at exactly **3** `WebOrderLine` rows (the account had none
  before — its Task 11 leftover was cleared first so the count means what it
  says), and `localStorage["lh-shop-cart"]` was gone (`null`) immediately
  after. A second pass proved the overlap case the first couldn't: signed out,
  added 2 more cartons of a product already in the merged cart as a guest, and
  signed back in — the row count **stayed 3** and that one line's cartons went
  1 → 3 (summed, not duplicated).
  **Facet counts agree with the database, not just with themselves.**
  `/products?category=Shower+cream+%26+gel&brand=Zen+Garden` showed "98
  products · showing 1–24" with a single "Zen Garden" filter chip and the URL
  carrying both params; `prisma.product.groupBy` on the same two filters
  independently returned **98** for that exact pair. An unavailable line
  (`needsReview` flipped true on a cart line, then restored) showed the "No
  longer available" chip, a fully `disabled` stepper — all three controls,
  checked in the accessibility tree, not just dimmed by CSS — a "—" amount,
  the total recomputed excluding it (RM 1,126.80-equivalent state → RM
  916.80 with the line's RM 210.00-per-carton×3 excluded), and *Send order*
  disabled.
  **Both cross-host redirects still hold.** A `MEMBER` signing in at the shop
  host's own `/signin` ended up authenticated on the portal host; a `CLIENT`
  signing in at the portal host's `/signin` ended up redirected to the shop
  host — both read from a real session, not inferred. Ops itself was read,
  not written: signed in as `aisha@lovinghandsportal.com` on the portal host,
  `/`, `/purchase-orders`, `/buyers`, `/products` and one PO detail page
  (`PO-2025-0001`) all answered 200 with real figures — 31 purchase orders ·
  RM 606,143.82 for the dashboard's 30-day window, 406 purchase orders (the
  list's own merged-with-drafts count) · RM 8,161,352.29, 11 buyers, 311
  products (308 real + the 3 fixture rows still live at that point), and the
  PO detail's RM 40,944.62 Delivered total — untouched by this branch, whose
  only shared files are two query modules, the proxy and `env.ts`. The PO
  detail page logged three pre-existing R2/CORS console errors on the seeded
  document's presigned URL ("We couldn't read that PDF" shown on screen) —
  the long-documented seeded-document issue, unrelated to this branch.
  **The catalogue repair from earlier tasks is now the recorded, deliberate
  state, not test data.** Development held zero `Product` rows when this
  phase started — a prior cleanup had taken the whole catalogue with it — so
  an earlier task re-ran `scripts/import-catalog.ts --labels` and a one-off
  controller script gave the 308 real products sample prices by an exact,
  deterministic formula — per-piece = litres in the name × 17.5, or if the
  name gives millilitres instead, millilitres ÷ 1000 × 19, or 6.90 if
  neither is present; price = `max(RM 9.90, round(packSize × per-piece × 10)
  ÷ 10)` — and cleared `needsReview` on all 308. That is left in place on
  purpose: Phases 18–22
  need a sellable catalogue, and the final `Product` count is **308**, all
  priced, `needsReview: false` on every one. The three `SDD-TEST-*` fixture
  products Task 7 added to unblock its own browser check when the table was
  still empty are gone.
  **Zero horizontal overflow across the full sweep**: `/`, `/products`, the
  category+brand filter, a product page and `/cart` with three lines, each at
  390/768/1440 — 15 combinations, `scrollWidth === innerWidth` on every one.
  The 390px smallest-control probe was run on three of the five swept
  routes — `/cart`, `/products` and the product page — returning 21–24
  elements under 44px each time; `/` and the category+brand-filtered
  `/products` were not re-run, on the assumption (not a measurement) that
  the pattern held. Every element in those three lists is the same kind: the
  search input/button and the category nav chips (32px/36px, spec-dictated
  and already reviewed-and-accepted in Task 7), plus plain text links
  (product names, footer rows). Every icon-only touch target — the cart
  trash button, the carton stepper's two buttons — was absent from all three
  lists, i.e. ≥44px on the routes actually measured.
  **One environment wrinkle, not a product defect, recorded because it cost
  real time.** Partway through, Chrome (via the Playwright MCP browser) began
  refusing every connection to `shop.localhost` and, after a server restart,
  even to `localhost` — while `curl` on the same machine reached both
  instantly and Chrome's own `net-internals` DNS lookup resolved
  `shop.localhost` correctly to `127.0.0.1`/`::1`. Clearing the host cache and
  flushing the socket pool did not fix it. The guest sweep, the cart journey
  and the merge proof were completed against the *same running server* reached
  as `foo.localhost` instead, after confirming by `curl` that `foo.localhost`
  and `shop.localhost` behave identically once `SHOP_HOST`/`SHOP_URL` are
  overridden to match (a shell-exported env var, read by `src/proxy.ts`'s own
  `process.env.SHOP_HOST` — no file changed, nothing committed). The canonical
  `shop.localhost` wire statuses in this entry were read by `curl`, unaffected
  by the browser issue. One sub-case was not re-verified here for the same
  reason: a signed-in staff member's `/shop` on the portal host returning a
  pinned 404 (rather than the guest's 307) — that code path is unchanged since
  Task 3 and was exercised in earlier tasks' own browser checks.
  Test data removed: the test client `sdd-client@example.com` deleted along
  with its `DRAFT` `WebOrder` and 3 `WebOrderLine` rows and 5 `LoginAttempt`
  rows; the 3 `SDD-TEST-*` products deleted (0 remaining rows referenced
  them); `Product` count **311 → 308**; `User` count **3 → 2**; `WebOrder`/
  `WebOrderLine` counts **1/3 → 0/0**. Independently re-verified rather than
  trusted: the one product Task 11 repriced sits back at RM 210.00 with
  `needsReview: false`, the one product Task 10 made inactive is `active:
  true` again, and every product in the catalogue reads `needsReview: false`
  (0 of 308). `aisha@lovinghandsportal.com`'s password was reset twice during
  this task's own verification (once to run the member-redirect check, since
  its prior value was unknown) and restored to the documented seed default,
  `Password123!`, at the end. 620/620 tests pass, `tsc`, `lint` and `build`
  all clean. **Not verified:** anything on production; no ops *write* path
  (upload → extract → confirm) — this branch's only shared files are read
  paths, and an upload spends a real Anthropic call; no ops write journey
  (advance/revert stage, edit, confirm) was exercised beyond the read-only
  pages named above, by controller instruction.
- 2026-09-10: Phase 16 — the storefront — built and **driven end to end in the
  browser as both audiences** (`feature/storefront`, spec
  `docs/specs/16-storefront.md`). A client browses, orders by the carton and
  sends it; ops sees it in the same queue an emailed PDF lands in, reviews it
  and confirms; the client watches the stage move. Catalogue, product page,
  cart, my orders, the ops review screen, the work-queue entry and the
  notification email.
  **The cart stores cartons and product ids and never a price**, and this was
  proven rather than asserted: with a cart open, `SCR-BAM-180` was repriced
  189.00 → 225.50 in ops; the stored lines read `unitPrice 0, amount 0`
  throughout; the reloaded cart showed **no trace of 189.00**, the line
  recomputed to RM 676.50 and the total to RM 1,926.50. `submitWebOrder` is the
  only place a price is written, and the snapshot took **225.50** — the figure
  the client actually saw — not the one current when they added it.
  **The silent regression is gone and was measured gone.** Making
  `PurchaseOrder.documentId` nullable turns the inner joins in
  `po-list.sql.ts` into a trap: left alone, every shop order vanishes from the
  purchase-order list, its money summary, the needs-review count and the buyer
  page, with no error and **no type failure** — the generated Prisma client
  types the relation as non-null whatever the schema says, so `tsc` found none
  of the call sites and they were audited by grep. After the fix the confirmed
  order appeared in the list, in `1 purchase order · RM 1,926.50`, labelled
  **WEB**, with "From the shop" where the uploader would be, and on the buyer's
  page. `po-list.sql.test.ts` asserts the generated SQL, because nothing else
  would.
  **Nothing internal reaches the shop, checked against the full HTML** rather
  than visible text: an ops note planted as `INTERNAL-CANARY-DO-NOT-SHOW`,
  `Aisha Rahman` (confirmedBy) and `Chris Lam` (stage `changedBy`) were all
  absent from a confirmed order's page. Another buyer's order id, a product not
  in the shop, and an invented id each returned a **genuine 404**. The
  projections are explicit narrow selects asserted by equality, so a column
  added later has to be a deliberate edit; stage dates are shown because they
  are the client's own facts, but only `STAGE` events — an `EDIT` event carries
  the totals-mismatch note — and `changedByName` is forced null.
  **Two defects the browser found that the build, the types and 574 tests all
  passed over.** The client's order list rendered **60-odd rows in one wall**;
  it now pages at twenty. And editing a quantity on the ops review screen
  changed the line amount while leaving subtotal and total as the buyer's
  originals — **the totals gate could not see it**, because `checkTotals`
  compares subtotal + tax against total and those three still agreed. That
  check is right for a scanned PO, where the document prints all three; a shop
  order has nothing printed to disagree with, so its subtotal is derived from
  the lines. Left alone it would have written a purchase order whose total
  contradicted its own line items. Measured after the fix: 3 cartons → 2 moves
  the line 676.50 → 451.00 and the order total 1,926.50 → 1,701.00.
  A third test passed **vacuously** and was caught: it called
  `deletePurchaseOrder({ poId })` where the schema wants `id`, so the action
  returned early and "not called" was true for the wrong reason.
  `writePurchaseOrder` is now the one writer for both intakes, so a shop order
  gets the same per-line product decisions and the same `ORDER_PLACED` event
  attributed to System; verified on the confirmed row, which carries
  `documentId: null` and the buyer's own `ACME-PO-771`. Open orders per buyer
  are capped at five, because `rate-limit.ts` covers sign-in and password reset
  only. `/api/documents/[id]/url` was deliberately **not** scoped by buyer —
  its ops-wide access is a product decision and Phase 15 already closed the
  client hole; the hazard is recorded in the route instead.
  Test data removed: 1 purchase order, 2 line items, 1 web order, 1 client;
  counts back to 400 / 1606 / 2 users, zero web orders, zero clients. 574
  tests, typecheck, lint and build pass. **Not verified:** anything on
  production — the shop subdomain does not exist yet, and the catalogue is
  unpriced.
- 2026-09-09: Phase 15 — client accounts — built and verified in the browser
  (`feature/client-accounts`, spec `docs/specs/15-client-accounts.md`). A
  buyer's own staff can now sign in on their own host, and the portal has its
  first notion of an account that is not ops staff.
  **The load-bearing change is that `requireUser()` changed meaning** — from
  "signed in" to "signed-in staff". Every Server Action and route handler
  already called it, and every one was written when ops staff were the only
  kind of user, so redefining it once makes all of them client-proof and makes
  code written later fail closed. `changePassword` is the single caller moved
  to `requireAccount`, because a client arrives with `mustChangePassword` set
  and has to be able to clear it.
  **The invariant is in the database, not only in code.** Marking clients by
  `buyerId` alone would fail *open*: `role` defaults to MEMBER, so a client row
  that lost its buyer would silently become an ops member with unscoped access
  to every buyer's orders. A CHECK constraint enforces
  `role <> 'CLIENT' OR buyerId IS NOT NULL`, and it was verified to refuse the
  case rather than assumed to. **Two migrations, not one**: Postgres refuses to
  reference a newly added enum value in the transaction that added it, and the
  CHECK spells `'CLIENT'` — combined they pass `migrate dev` against a database
  that already has the value and fail `migrate deploy` in production.
  **A defect the browser found and the build could not.** A cross-host redirect
  issued from the proxy came back as `location: /` — its origin stripped,
  because both hosts are one deployment — and the browser bounced against the
  same host until it gave up with `ERR_TOO_MANY_REDIRECTS`. The proxy was
  logged building `Location: http://localhost:3000/` while the wire carried
  `/`, so something below it relativises. **A redirect from a layout survives
  intact**, so both cross-host redirects moved there, where they also run
  against a real session rather than a token up to five minutes stale.
  Measured after the fix: an ops member signing in on the shop host is sent to
  the portal; a client signing in on the portal host is sent to the shop;
  `/shop`, `/shop/cart` and `/shop/orders` are each a **genuine 404** on the
  portal host with the status pinned; the full client journey runs sign-in →
  forced `/account/password` → storefront scoped to their own buyer
  ("Acme Industrial Sdn Bhd"); and the session carries `role: CLIENT` with the
  `buyerId`. **The cookie is host-only and that is the property to never trade
  away** — a client's session on the shop host does not exist on the portal
  host at all, so they arrive signed out rather than merely redirected. One
  consequence worth knowing: an ops person bounced off the shop host has to
  sign in again on the portal, which is inherent to that isolation.
  Google is refused for a client with "Use your email and password to sign in."
  — `allowDangerousEmailAccountLinking` is on deliberately, and without that
  branch a client whose invited address happens to be a Google account could
  link it and skip `mustChangePassword` entirely. Clients are also excluded
  from the admin users list, because the drawer's role schema cannot represent
  CLIENT — the free half of this design — and a customer must not be
  promotable to staff from there.
  `/shop` serves a placeholder until Phase 16, so the shop host says something
  truthful the moment this deploys rather than 404ing like a broken invite.
  Test data removed: the invited client deleted, the development member
  reverted to MEMBER; zero CLIENT rows remain. `SHOP_HOST`/`SHOP_URL` added to
  `.env.example`, both optional — unset means one host, which is what makes dev
  and preview deployments work. 510 tests, typecheck, lint and build pass.
  **Not verified:** anything on production — the shop subdomain does not exist
  yet. Adding it is `SETUP-CHECKLIST.md` §6.1, and the Google OAuth step must
  deliberately **not** list it.
- 2026-09-09: Phase 14 — product images — built and verified in the browser
  (`feature/product-images`, spec `docs/specs/14-product-images.md`). The write
  path Phase 08 specced and never built: **`ProductImage` rows were created
  nowhere in application code**, only by the seed, so every real product was a
  text card. `reorderImages` and `deleteImage` already existed; only upload was
  missing.
  **Presign takes the whole batch in one call**, which is not a stylistic echo
  of Phase 03: `ProductImage` has `@@unique([productId, position])` and the hook
  runs three files at once, so presigning per file races on `position` and
  throws P2002. Three images uploaded together landed at positions 0, 1, 2.
  **`sharp().rotate()` was verified rather than asserted.** A test file stored
  800×1400 carrying EXIF orientation 6 produced a **1400×800** derivative —
  without `.rotate()` it stays 800×1400 and renders sideways, because sharp
  drops EXIF on write. `withoutEnlargement` proven the same way: 2400×1600 →
  1600×1067, but 600×600 stayed **600×600** rather than being upscaled into
  blur. `next.config.ts` `SHARP_ROUTES` gained the complete route and the
  emitted `.nft.json` was checked before pushing — 76 sharp files, 14 `@img`
  files — because that failure is production-only and cannot reproduce on macOS.
  **Two defects the browser found that the build could not.** *Make cover*
  **swapped** with position 0 instead of splicing to the front, so making image
  3 the cover silently demoted image 1 to position 3 — reordering a picture the
  reader never touched; adjacent arrows stay a swap, where a swap and a move are
  the same thing. And the four icon buttons per tile compressed to **21px** at
  390px against the 44px minimum the 2026-09-06 mobile pass set; tiles drop to
  two columns below `sm` and the buttons take `size-11`, measured back at
  exactly 44px.
  Rejections verified in a mixed batch: a PDF and a 17.2 MB file were refused by
  name ("That image is 17.2 MB — the limit is 5.0 MB") **while the good file in
  the same batch still uploaded**. Deleting removed the row and **both** R2
  objects, leaving no orphan. Zero page overflow at 390 / 768 / 1440px, with the
  gallery column at 457px against the details card's 639px — the 5fr:7fr split
  holding, no aspect-ratio blowout.
  `scripts/import-product-images.ts` reads a folder named by SKU, and the
  ordinal rule was checked against the real catalogue: `LHANDS-DW-1000-LE-2.jpg`
  matched the product whose SKU *is* that, not image 2 of `…-LE`. Unmatched
  files are reported, never fuzzy-matched. A real run wrote 4 images across 3
  products. **Reordering is arrow buttons plus Make cover, not drag** —
  `@dnd-kit` is in the master spec's dependency table and not in
  `package.json`, and buttons need no keyboard alternative.
  Test data removed: 7 images and all their R2 objects, `productImage` count
  back to the seed's 19; the development member was promoted to super admin to
  reach the manager and **reverted to MEMBER** afterwards. 482 tests, typecheck,
  lint and build pass.
  **Deploying found a real defect, and the local check that was supposed to
  catch it was worthless.** The spec said to verify the emitted `.nft.json`
  before pushing; that was done — 76 sharp files — and production still 500ed
  with the same `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6`. A macOS build
  traces sharp *anyway*, because Next only strips `@img/sharp-libvips*` when
  `hasNextSupport` is true, so the local artefact looks identical whether or not
  the include matched. **`outputFileTracingIncludes` keys are globs**, and
  `[id]` is a character class matching one `i` or `d`, so
  `/api/products/[id]/images/complete` never matched the real page;
  `/api/avatars` has no brackets, which is why `/settings` kept working and hid
  the pattern. The key is now `/api/products/**`.
  **The probe that found it needs no super admin and touches no data**: sharp
  dlopens at module load, before `requireSuperAdmin()` runs, so an authenticated
  POST from any member distinguishes them — 500 with Next's HTML error page
  means the module failed to load, 401 with our own JSON means it loaded. Both
  routes now answer `401 {"error":"This action needs super admin access."}` on
  `www.lovinghandsportal.com`. Worth reusing for any future sharp route.
  One deploy in between failed on Prisma `P1002`, a transient Neon timeout
  during `migrate deploy`, and succeeded on a plain redeploy — unrelated to the
  code. **Still unverified:** a full end-to-end upload on production, which
  needs a super admin, and the only one is Google-only.
- 2026-09-09: Phase 12 — product matching at review — built and verified in the
  browser (`feature/product-matching`, spec `docs/specs/12-product-matching.md`).
  Every line of a PO now carries an explicit human decision — a catalogue
  product, *create a new one*, or *not a product* — and Confirm is locked until
  all of them are made, phrased like the totals gate beside it and mirrored by a
  server check so calling the action directly cannot bypass it.
  **The defect this fixes is that `confirmPurchaseOrder` re-ran `resolveProducts`
  and overwrote `productId` from the printed code**, so a human correction had
  nowhere to survive. Proven in the browser rather than argued: a line printing
  `ZEN-SC-1000-GM-VN` with the **Iraq** product chosen by hand confirmed as the
  Iraq product. Under the old code it would have been overwritten with Vietnam.
  Scoring is one pure module, `src/lib/extraction/match-products.ts`, with no
  Prisma import and no I/O, so it is unit-tested against the codes production
  actually holds — 24 tests. Exact code 100, code ignoring separators 96, exact
  name 92; otherwise token overlap weighted by **inverse document frequency**,
  because four of six words in a typical line are shared by two hundred
  products, clamped to 90 so a similarity score can never impersonate the exact
  rule. **A size disagreement caps the score at 40 however much wording agrees**
  — 2.1L and 500ML share every word they have. Tokenising is deliberately *not*
  `sku.ts`'s: a period separates rather than deletes (or `ZENSC-R.JELLY2LT`
  loses `jelly`) and a letter/digit boundary splits.
  **Market is shown on every candidate and never scored.** Documents rarely
  print it, so scoring it is noise — but the development catalogue holds **8
  products named `ZEN 1L — Goat's Milk`** differing only by market, and the
  picker told them apart in one list (`… · Arab · 12/carton`, `… · India · …`)
  without opening another screen.
  **This reverses a Phase 11 decision on purpose.** `resolveProducts` split into
  `suggestProducts` (reads, writes nothing) and `createProductsForLines` (writes
  inside `confirmPurchaseOrder`'s transaction), so **a discarded draft leaves no
  products behind** — the cost Phase 11 recorded and named the fix for. Measured:
  a line marked *Create new product from this line* carrying
  `TOTALLY-UNKNOWN-CODE-XYZ`, then discarded, left the catalogue at 320 products
  and created zero.
  **Two things the plan got wrong that the code caught.** It specified
  `text-accent-amber` for the match hint — **there is no such token**; it would
  have compiled to no colour at all and inherited the surrounding ink. The hint
  uses `brand-amber`, the amber `Field` already uses for a low-confidence
  extraction. And it predicted `src/actions/confirm.test.ts` would fail once
  `resolveProducts` was deleted; **it kept passing**, because both test files
  mock the module by name and the mock supplied the missing export. `tsc` was
  the only thing that caught the break, which is why tasks 3+4 and 6+7 were each
  committed together rather than leaving a commit that did not build.
  Verified at 390 / 768 / 1440px: **zero page overflow at all three**, with the
  line-items table scrolling inside its own container at exactly 952px — the new
  `--spacing-line-items`, widened from 840px in the same commit as the first
  column going `w-44` → `w-72`, since under `table-fixed` the `<col>` widths are
  authoritative and the token is what the scroller measures. `Combobox` gained
  `pinned` rows so *Create new product* and *Not a product* stay reachable when
  the query matches nothing, which is exactly when they are the answer —
  confirmed by typing `zzzznothingmatches` and seeing only those two rows.
  All test data removed: 1 purchase order, 4 line items, 1 stage event, and both
  extractions restored to `draftJson NULL` / `SUCCEEDED`. Counts returned to 320
  products, 400 purchase orders, 1606 line items; no R2 objects were created.
  467 tests, typecheck, lint and build pass. **Known, not verified:** the
  document preview still 404s on every seeded document, which is expected data
  rather than a defect — the seed writes `r2Key` values it never uploads.
- 2026-09-09: Two defects found by yesterday's production audit, fixed and
  merged (`fix/sku-shape-and-duplicate-check`). **A product could exist that
  its own edit form refused to save.** `resolveProducts` writes a line's
  printed code straight to the database while `skuSchema` demanded
  `^[A-Z0-9-]+$`, so the products created from real orders —
  `ZEN/SC/2100/CARROT`, `ZENSC-R.JELLY2LT`, `KE218441 68216` (a space) — were
  all unsaveable from the drawer. The schema was a guess about the domain that
  the documents disproved; it now accepts `A-Z 0-9` plus `- . _ / +` and
  spaces, keeps the discipline that mattered by upper-casing and collapsing
  whitespace, and `normaliseSku` is applied in `resolveProducts` too — on
  lookup as well as on create, or the two would diverge. A code carrying
  anything outside that set still needs editing by hand; that is rarer than the
  slashes and spaces that were actually breaking.
  **The duplicate check missed the duplicate it was there to catch.**
  `checkDuplicate` keyed on `buyerId + poNumber`, so when the same document was
  confirmed twice sixteen minutes apart — the second time against a buyer typed
  `STAR VALUE SDN BHD` rather than the `STAR VALUE SDN BHD @ SVPP` created the
  first time — nothing matched and both orders went live. It now falls back to
  the number under any buyer and reports whose. Only the same-buyer case still
  blocks Confirm, because two customers can genuinely share a numbering scheme;
  a different buyer gets a warning naming them and no "this is a revised PO"
  checkbox, since a revision across two buyers would point `revisionOfId` at
  another customer's order. `checkDuplicate` had no test at all, which is how
  this survived — it has four now.
  **A correction to yesterday's report:** `PO-00068` is *not* a duplicate. It is
  revision 1 superseded by revision 2, which is the revision mechanism working;
  the list only ever showed the newer one. Only `SVPPPO26090009` is genuinely
  doubled — same total, same single line (2,112 × Everfresh B Shampoo), the
  same PDF uploaded twice as two `Document` rows, no stage moves on either.
  Deleting one is still pending: which buyer name is correct is the customer's
  own convention, not something to infer. 442 tests, typecheck, lint and build
  pass.
- 2026-09-09: The real catalog is on **production** — 309 products — and the
  landscaping demo data is gone. **The audit is the part worth remembering:
  production was not the demo database everyone assumed.** Before deleting
  anything, a read-only pass found the ops team had been using it: 5 confirmed
  purchase orders (Triways `PO-00068` RM 9,912, Star Value `SVPPPO26090009`
  RM 12,777.60, a 2019 `US-001` test), 8 products auto-created from those
  orders, 17 uploaded documents and **2 drafts still waiting in the review
  queue**. The plan as approved the day before — `--replace-demo`, which
  matched demo rows by SKU prefix — would have run against live business data.
  Two changes made it safe. `replaceDemo` now identifies seeded rows by their
  **id prefix** (`prisma/seed.ts` mints `prd…`/`po…`/`doc…`; everything the app
  creates is a cuid), which a person cannot accidentally reproduce the way they
  could type a SKU, and it **refuses outright** if any non-seeded purchase order
  turns out to reference a seeded product. The dry run then reported exactly
  12 products and 400 orders, leaving the 5 real ones, and did not refuse.
  **The second finding changed what the catalog should be.** Those 8 real
  products carry the codes the customers print — `ZEN/SC/2100/CARROT`,
  `ZENHW-LAV500ML` — while the import generates `ZEN-SC-2100-CR`,
  `ZEN-HW-0500-LV`. The same products under two codes, and only the customer's
  code can ever match an incoming document, since that is what
  `resolveProducts` compares. Importing blind would have left 8 pairs in which
  the *empty* row looked official and the *real* row did the work. `--merge`
  takes an explicit `{existing SKU: imported SKU}` map — 7 pairs, written by
  hand and reviewed, never fuzzy-matched — and enriches the existing row with
  brand, variant, pack size, market and category while keeping its code, its
  name as printed on the document, its price and its order lines. The eighth,
  `EVERFRESH B SHAMPOO LVD& CHAMOMILE 2.1L`, has no equivalent in the sheet
  (the sheet's Everfresh lines are all shower cream) and was left alone.
  Sequence: pushed 8 commits, Vercel deployed in 2m and `prisma migrate deploy`
  applied `product_country`, `product_market` and `product_brand_variant_pack`;
  columns confirmed present *before* any data was touched. Result verified on
  production: 309 products, **0 generated twins**, 0 landscaping rows, the 5
  real orders and 17 documents intact, 19 line items, and the merged rows
  holding their real prices (RM 6.60, RM 2.90) rather than 0.00. The site
  answers 200 and redirects unauthenticated traffic to `/signin`. Production
  credentials were pulled to the scratchpad and deleted after each use.
  **Three things found and not acted on.** Production holds apparent duplicate
  orders — `PO-00068` twice for the same buyer and total, and
  `SVPPPO26090009` twice under buyers `STAR VALUE SDN BHD` and `STAR VALUE
  SDN BHD @ SVPP`; the duplicate check keys on buyer, so a buyer entered two
  ways defeats it. **A product auto-created from a purchase order can carry a
  SKU the edit form rejects**: `resolveProducts` writes `line.sku` straight to
  the database while `productSchema` demands `^[A-Z0-9-]+$`, so
  `ZEN/SC/2100/CARROT` cannot be saved from the drawer until its code is
  changed. And `APP_URL` is unset in production, so `src/lib/env.ts` falls back
  to `VERCEL_URL` — the app boots, but password-reset and invite emails link to
  the per-deployment URL rather than `www.lovinghandsportal.com`.
- 2026-09-09: The customer's real catalog is in the development database — 308
  products extracted from **the PDF**, not a workbook. `ZEN GARDEN DC INVENTORY
  2026` arrived as a one-page Google Sheets print: a ~300-row, ~800-column
  sheet squeezed onto one A4 page at **sub-1pt text**, which is why a plain
  text extraction interleaves the columns into nonsense. **The cell borders are
  what made it readable.** Sheets draws every border as a vector line and omits
  the internal borders of a merged cell, so the horizontal borders inside one
  column's x-range mark exactly where that column's merged cells begin and end,
  and a merged cell's text sits at the vertical centre of its range — enough to
  rebuild brand, line and variant with each merged value spread across the rows
  it covers. 360 row bands, 336 label rows, 89 lines, 18 brands, 9 export
  markets. Verified against the screenshot the user sent: `ZEN GARDEN |
  VIETNAM ZEN 2.1L (6) | GOAT'S MILK…` came back exactly, and
  `ZEN-SC-2100-GM-VN` is the SKU it produced. `scripts/pdf-to-labels.py` is
  that extractor, and re-running it reproduces
  `docs/imports/zen-garden-dc-inventory-2026.labels.json` byte-for-byte;
  `import-catalog.ts --labels` parses it with the *same* code an .xlsx goes
  through, so the PDF path adds no second parser.
  **The dry run earned its place — it found six defects before anything was
  written.** Three in the parser: `LOTUS 'S 2.1L` produced a line called `'S`;
  `(52CTNS/P)` left an empty `()` in names; and duplicates were dropped in
  **silence**, which was hiding the next two. Then, once reported: 9 real
  products were being lost because the agreed SKU shape has no pack segment and
  the sheet sells the same line in two carton sizes (MR.KING 1.5L by 12 and by
  6, the roll-on by 72 and by 12, olive oil big-carton and inner). A clash now
  takes `-X{pack}` **only when the pack is what differs** — a test caught the
  first attempt giving two twelves `-X12` each, asserting a distinction the
  packs do not make — and falls back to a counter for `1L DWASH PUMP` vs `CAP`,
  which are both twelves. Sixth: the sheet's own two misspellings,
  `PHILLIPPINES` and `PHILLIPINES`, were becoming two markets in a picker whose
  whole point is that a list cannot fragment; `AA PHARMACY` and `L'EVINIA` also
  title-cased to `Aa Pharmacy` and `L'evinia`. Accounting is now exact:
  336 rows − 28 = 308 products, nothing lost.
  **28 rows in 5 blocks were deliberately not imported**, because the sheet
  nests a second table inside the variant column and a brand/line/variant model
  cannot represent it: ZEN GARDEN HAIR GEL (12 rows, colours × sizes × packs),
  ZEN HAND SANITIZER (8, sizes), THERAPY LEVEL HAND SANITIZER (3, sizes),
  FRIENDS 300ML ALOE (2, the line name split across two columns) and KIMIA
  SUCHI 240ML (3 — bottles, inserts and caps, which are packaging rather than
  goods). The importer prints them so a person can enter them.
  Every product landed with `listPrice` 0.00 and `needsReview: true`, so the
  *Needs review* chip is the pricing worklist — verified in the browser reading
  308, beside a brand filter with 18 entries and cards reading
  `L.Hands · Lemon / LHANDS-DW-1000-LE-2 · 12 per carton`. Column A is stored
  as the brand verbatim, including the values that are really customers
  (Econsave, Hero Market, AA Pharmacy) — the sheet's own grouping, editable in
  the portal, and nothing invented. **Development only**; production is
  untouched.
- 2026-09-09: Catalog model built, verified in the browser and merged (`feature/catalog-model`) —
  `brand`, `variant` and `packSize` on Product, the nine personal-care
  categories replacing the landscaping list, `src/lib/sku.ts` generating
  `{BRAND}-{TYPE}-{SIZE}-{VARIANT}-{MARKET}`, `src/lib/catalog-import.ts`
  reading the customer's sheet, `scripts/import-catalog.ts` loading it, and
  the seed rewritten to a ZEN-shaped catalog. **The SKU proposes itself** on
  the create page from brand, category, the size in the name, variant and
  market, until the reader types one: watched live going `SC-2100-MY` →
  `ZEN-SC-2100-MY` → `ZEN-SC-2100-GM-MY` → `ZEN-SC-2100-GM-VN` as each picker
  was filled, then landing on the detail page with all nine `dl` rows matching
  what was entered. Brand, variant and market share one `GrowingListPicker`
  (the day-old `MarketPicker`, generalised); search matches all three, so
  `?q=vietnam` finds the product; the brand filter appears only once two brands
  exist. **The sheet parser is tested on the screenshot's own shape**: a
  worksheet with ZEN GARDEN merged over two lines in A, `VIETNAM ZEN 2.1L (6)`
  merged over five variants in B, one variant per row in C — every merged cell
  filled down from its anchor, the market prefix split off whether it is a
  country or a customer (MYDIN, HERO MARKET), `(6)` and `(48PCS/CTN)` both read
  as pack counts, pallet notes and `[19]` footnotes dropped. The column
  positions are an assumption until the XLSX arrives; `--columns` overrides
  them and `--dry-run` prints the table before anything is written. **One
  layout defect the build could not catch, and it was already latent
  yesterday**: `aspect-4/3` on a grid child that *stretches* to the row takes
  its width from the stretched height, so once the details card grew to eleven
  fields the empty gallery panel came out 1470px wide and pushed the card off
  the screen (measured 130px of card at 1440px). `self-start` on the panel —
  and on `ProductGallery`'s empty state, which has the same shape — fixed it:
  446px / 625px, no overflow. **Two Prisma commands hung** during the build,
  once for 5 minutes: the machine slept mid-command (the clock jumped 19:23 →
  21:05) and `migrate dev --create-only` also prompts in a way a non-TTY
  cannot answer, so the three-column migration was written by hand and
  applied with `migrate deploy` under a `timeout`. An unpriced import lands at
  `0.00` and the detail page now says "No list price set yet" rather than
  "0.0% above list". Test data removed (the product and its price row), the
  seed member reverted to MEMBER, no brand/variant/market values left in the
  development database. 429 tests, typecheck, lint and build pass.
- 2026-09-08: Product creation moved to its own page and products gained a
  market (built as "country of origin", renamed `market` the same day once the
  customer's inventory sheet showed the values are destinations and customers —
  see Notes), built, verified in the browser and merged
  (`feature/product-create-page`). **`/products/new` is shaped like
  `/products/[id]`** — same back link, breadcrumb, eyebrow and
  `lg:grid-cols-[5fr_7fr]` band — so the screen you fill in is the screen you
  read afterwards; the name is the title field and the list price the display
  figure, and the eyebrow fills in live (`STN-BAS-060 · Stone · per slab` while
  typing). None of the analytics are mirrored: a product that does not exist
  has no history, and six em-dash tiles over an empty chart would be furniture.
  `+ New product` is a real `<a href>` styled as the ink pill rather than a
  drawer trigger, so cmd-click opens a browser tab for free without the stale
  catalog a forced `target="_blank"` would leave behind. **`ProductSheet`
  became edit-only**, losing `BLANK` and the three `product ? … : …` branches
  in its title, description and button; `product` is now required, which is
  what made TypeScript find every construction of `ProductInput` when the
  country key was added. **The country list is not hardcoded.** The user asked
  for a fixed short list and then that it "be input by super admin users", and
  the two reconcile as a `Combobox` whose options are `listCountries()` — every
  country already on a product — plus the `+ Add "…"` row it already renders,
  so the list is built by using it. `PRODUCT_CATEGORIES` stays fixed for the
  opposite reason: share charts group by category, and a fragmented list makes
  them quietly wrong, while a country is a label on one product. Nullable and
  never optional, trimmed to null, `max(56)`; the twelve existing products show
  `—` and nothing was backfilled. **Verification needed a super admin and the
  only one is Google-only**, so the seeded member was promoted on the
  development branch (`ep-mute-frog`) and reverted afterwards — the first
  attempt was blocked by the permission classifier and the user approved it
  explicitly. Verified live: created a product with a typed-in country, landed
  on its detail page with the eyebrow, title, `RM 128.00` and
  `Country Indonesia` all matching what was entered; the next create then
  offered Indonesia, and typing `indonesia` lower-case offered the existing
  entry with **no `+ Add` row**, so the list cannot fork on casing; "No country"
  cleared it back to `—`; an empty form toasted "A name is required" and a
  reused SKU "That SKU is already in use.", both keeping the typed values.
  **Two defects the build could not catch, both at 390px**: the name input was
  squeezed to 180px because the Create button shared its flex row (the header
  now stacks below `sm`, 180px → 350px), and the `aspect-4/3` gallery
  placeholder filled the screen so every field sat below the fold (`h-32` below
  `sm`, first field now at y=547 of an 844px viewport). A hydration mismatch
  seen during this pass was a stale dev-server bundle, not a defect — a restart
  cleared it, and the console is empty on a fresh load. **Deviation from the
  canvas:** there is no `/products/new` artboard, so this layout is derived
  from the product detail one; `CLAUDE.md` makes the canvas the source of truth
  and it is behind the code until someone draws it. Test data removed: the
  product and its price row deleted, no country values left in the database,
  the member's role reverted. 406 tests, typecheck, lint and build pass.
- 2026-09-08: Super admin access confirmed on both databases and
  `scripts/grant-super-admin.ts` added. Asked for as "make
  jobhunters.ai.pro@gmail.com super admin on production and development" —
  **it already was on both**, checked before anything was written and then
  written anyway so the state is explicit rather than assumed. The two
  databases are genuinely separate branches: development is `ep-mute-frog…`,
  the block appended at the bottom of `.env.local` — the pair above it labelled
  "development branch", `ep-red-hat…`, still rejects its password after the
  2026-09-06 endpoint move, and both Next and node's `--env-file` take the last
  duplicate key, which is why the app works at all — while production is
  `ep-polished-wildflower…`, read from `vercel env pull --environment=production`
  and deleted again afterwards. Each row carries `emailVerified` and no
  password, which is exactly what lets `allowDangerousEmailAccountLinking`
  attach the Google account on first sign-in; neither database had an `Account`
  row yet. **`SEED_SUPER_ADMIN_EMAIL` had drifted to
  `superadmin@lovinghandsportal.com`** — an address that can sign in by neither
  route — so a `--reset` reseed would have truncated the real super admin and
  replaced them with an unusable one; `.env.local` now names the Gmail address,
  with `SEED_SUPER_ADMIN_NAME` holding the display name the row already
  carries. The localhost callback is registered on the OAuth client — the
  button reaches Google's account chooser with no `redirect_uri_mismatch` — and
  production shares the same client id. **Unverified:** the production callback
  URI, because the browser held a signed-in production session and checking
  meant either ending it or authenticating as the user. **Noticed, not acted
  on:** production holds 405 purchase orders, the demo seed
  `docs/specs/SETUP-CHECKLIST.md` §1 forbids there, and `APP_URL` is absent
  from the pulled production environment although `src/lib/env.ts` requires it.
- 2026-09-08: A picture change now reaches every open tab, merged
  (`fix/avatar-across-tabs`) and verified on production. Reported from the
  Activity card — the sidebar showed the new picture while the Activity rows
  still showed initials. **The data path was never wrong**: every screen reads
  `User.image` on the server, and a fresh load of the very purchase order in
  the report showed all four of that person's Activity rows carrying the new
  picture (checked on production before changing anything). What is wrong is a
  page rendered *before* the change that never re-renders, and two tabs
  reproduce it exactly: change the picture in one and the other keeps the old
  sidebar, table avatars and Activity rows indefinitely, because
  `router.refresh()` only ever reaches the tab it runs in. A `BroadcastChannel`
  closes it — the picker posts once the save has settled, and
  `AvatarChangeListener`, mounted once in the portal layout, refreshes every
  other tab, dropping its client router cache with it. A channel never delivers
  to the context that posted, so the saving tab is not refreshed twice.
  Verified with a watcher installed in the second tab *before* the change, on
  production: all four Activity rows and the sidebar moved to the new picture
  with no navigation, no reload and no click in that tab. Test pictures removed
  from production and locally afterwards.
- 2026-09-08: The shell picture waits too, and the toast waits for it, merged
  (`feature/avatar-saving-everywhere`) and verified on production. Two reports,
  one cause: the picture in the sidebar and the mobile top bar is the same
  picture `/settings` changes, but it lives in the portal **layout** — a
  different subtree, re-rendered on the server — so it sat unchanged and
  unmarked for the whole save, and "Picture updated" fired the moment the
  action returned, before the session cookie was rewritten, before the shell
  re-rendered and before the browser had even fetched the new file. A success
  message that is briefly untrue. `AvatarSavingProvider` carries one flag from
  the picker to `UserMenu` — it sits in the layout because that is the only
  tree holding both — so the shell picture takes the same scrim and ring as the
  preview. The order is now write → fetch the new picture (`preloadPicture`,
  resolving on error too rather than holding a spinner open) → rewrite the
  session cookie → await the refresh → stop the spinners → toast.
  `useAwaitableRefresh` is what makes the last step waitable at all:
  `router.refresh()` returns `undefined`, so wrapping it in a transition is the
  only way to know the server-rendered shell has caught up; it gives up after
  8 s rather than stranding a spinner, the same failure class as the unguarded
  action promise. Measured locally at 1150 ms for the shell picture and 1250 ms
  for the toast; on production all three spinners showed and the picture and
  the toast landed in the same 50 ms sample after a 4.8 s cold start. **A
  verification trap worth remembering:** the first production run appeared to
  fail — no shell spinner, toast 3.7 s before the picture — because the
  deployment had not finished and the old `UserMenu` was still being served.
  The marker that settled it is the wrapper element's exact class, not a
  deployment id, which changes on an intermediate build. Test pictures removed
  from production and locally afterwards.
- 2026-09-08: A saving spinner on the picture itself, merged
  (`feature/avatar-saving-spinner`) and verified on production. The clicked
  tile already carried the 14px ring, but it is a small mark on a 64px
  thumbnail and the thing being watched is the 96px picture above it, which sat
  unchanged for the whole save — 3.2 s on a cold serverless start. The preview
  now takes a scrim and a 28px ring while any picture change is in flight
  (choose, upload or remove), with an `aria-live` "Saving your picture" line
  for anyone who cannot see it; `Spinner` grew one size rather than a second
  spinner being invented, and every existing caller keeps the 14px default.
  Photographed locally with a 4 s delay patched into `fetch`, then confirmed
  live: both spinners, eleven tiles dimmed, "Picture updated" after 3.4 s. Test
  pictures removed from production and from the local database afterwards.
- 2026-09-08: **Avatars had never worked in production** — fixed and merged
  (`fix/sharp-libvips-tracing`), verified live on `www.lovinghandsportal.com`.
  Reported as "clicking an avatar shows *We couldn't reach the server*"; the
  toast was telling the truth, and the same failure had been silent before that
  morning's feedback fix. Probing production separated the paths: the
  `/settings` page (renders 48 DiceBear previews server-side), `/api/upload/presign`
  and `/api/avatars/[userId]` all answered normally, while **choosing an avatar
  and uploading a photo — the only two paths that import `src/lib/avatar-store.ts`
  — both returned Next's own 500 page**, before `setGeneratedAvatar`'s own
  try/catch could run, and wrote nothing. The same production build ran fine
  locally under `npm start`, which pointed at the runtime rather than the code.
  The Vercel log named it exactly: `Could not load the "sharp" module using the
  linux-x64 runtime — ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.6: cannot open
  shared object file`. **Not a missing dependency.** `@img/sharp-linux-x64` was
  in the bundle — sharp got far enough to raise its own loader error — but the
  libvips package it dlopens was not, because **Next's build trace drops it on
  purpose when the build runs on Vercel**: `collect-build-traces.ts` adds
  `**/@img/sharp-libvips*/**/*` to `serverIgnores` whenever `hasNextSupport` is
  true, dating from when the platform supplied sharp for image optimization.
  That is why no amount of local testing could reproduce it — a macOS build
  traces the darwin packages, which are not ignored.
  `outputFileTracingIncludes` in `next.config.ts` re-adds `sharp` and `@img/**`
  for the two entry points that reach them, checked against the emitted
  `.nft.json` files before pushing. Verified on production after the deploy:
  a clay avatar saved in 3.2 s with the spinner showing, toasted "Picture
  updated", replaced the picture and the top bar, and survived a reload; an
  upload returned 200. Both test pictures were removed afterwards, so the
  account is back to initials with no stray R2 object.
- 2026-09-08: Avatar choice feedback fixed and merged (`fix/avatar-choice-feedback`)
  — reported as "let the user choose an avatar; the chosen one should replace the
  Avatar", with a screenshot showing a style chip selected and the initials
  unchanged. **Choosing always worked** — reproduced end to end on voxel-bot and
  clay — but it takes ~550 ms and drew nothing while it did, so a click looked
  inert. **The real defect was the failure path**: `run()` awaited the server
  action with no try/catch, so a *thrown* action (server unreachable, deploy
  mid-flight, session gone) rejected the promise, `setBusy(null)` never ran, and
  **all twelve tiles stayed permanently disabled with no message** — the picker
  was dead until a reload. Reproduced by stopping the dev server mid-click:
  12 of 12 disabled, zero toasts; after the fix, "We couldn't reach the server.
  Try again." inside 100 ms and every tile live. The upload `fetch` carried the
  same trap and the same fix. Feedback reuses the click-feedback pass's
  vocabulary rather than inventing one — the clicked tile takes the ring
  `Spinner` over a canvas scrim, the other eleven drop to 60%, the group takes
  `aria-busy`, and success toasts "Picture updated" as an upload already did. The
  tiles were also the only control on the screen that never said what clicking
  them did, hence the "Pick one to use it as your picture" caption and a
  "Use this avatar" label on each.
- 2026-09-08: Settings avatar gallery and page trim — built, verified in the
  browser and merged (`feature/avatar-gallery`); spec
  `docs/specs/10-settings-and-avatars.md` updated to match. **The gallery is a
  fixed set now.** Phase 10 seeded six previews from the user's own display name
  and offered Shuffle, which rewrote `?seeds=` with fresh `randomUUID()`s on a
  server round trip — a lottery, not a choice, since the face you liked two rolls
  ago was unrecoverable. The seeds are `option-1` … `option-12`, the same twelve
  for every person on every visit, so `searchParams` left the page entirely and
  `useUrlNavigation` left the picker; clicking still saves immediately.
  **croodles was dropped rather than merely losing its credit line**: it is CC BY
  4.0 and that line *was* its attribution, so keeping the style without it would
  have left the licence condition unmet. The other four styles are CC0, which is
  why `attribution` is gone from `StyleEntry` as well — an empty hook invites
  someone to re-add a CC BY style without noticing what it obliges, and the spec
  now says any style added later must be CC0 or bring its line back. **The
  Sessions row, its dialog and the `next-auth/react` `signOut` import left
  `SecurityCard`**, leaving Password as the card's only row; `signOutEverywhere`
  stays in `src/actions/profile.ts`, tested and unreachable, because
  `sessionVersion` is still what disabling a user and setting their password
  bump. **A user who picked an avatar before today keeps the picture** — their
  `avatarSeed` is name-derived, so it is not one of the twelve and no tile is
  ringed until they choose again. Verified against the live database at 1440px
  and 390px: four chips, twelve tiles, no Shuffle, no credit line, no Sessions
  row; clay option 5 saved on click, repainted the preview and the sidebar
  without a reload and was still ringed after one; zero requests to
  `api.dicebear.com`; no horizontal overflow at 390px, where the tiles wrap to
  three rows of four at 64px. Remove put the initials back and `clearAvatar`
  deleted the R2 object, so no test data was left behind. 398 tests, typecheck,
  lint and build pass.
- 2026-09-07: Phase 11 — purchase order revamp — built, verified and merged
  (`feature/po-revamp`, spec `docs/specs/11-po-revamp.md`), with the product-code
  and upload-delete follow-ons merged after it. Six changes: super admin delete,
  delivery date and buyer reference removed, a zoomable original document, a
  visible remark, product codes that build the catalogue, and a line-items table
  that stops clipping itself. **Product codes now build the catalogue** — exact
  code matching, case-insensitive and never fuzzy, but an unknown code now
  *creates* a product rather than leaving the line unmatched; **description
  matching is deliberately gone**, because two active products can share a name
  and the old fallback would attach a line to the wrong product *and* skip
  creating the right one. Cost stays bounded per document (one read, at most one
  write, at most one re-read), and `createManyAndReturn` rather than `createMany`
  because the new ids link the lines. **The known cost, stated:** products are
  created at extraction time, so **a discarded draft leaves its products
  behind** — the user chose this over creating them at confirm, and
  `needsReview` is what makes the junk visible rather than silent; moving
  creation into `confirmPurchaseOrder`'s transaction is the fix if it proves
  noisy. **Deleting keeps the document**: line items and stage events cascade,
  the `Document` and its R2 object stay, and the `Extraction` goes back to
  `SUCCEEDED` so the upload returns to the review queue. The dialog's revision
  warning turned out to be the reverse of the plan's assumption — a superseded
  order redirects to its newer revision, so the real consequence is that deleting
  a revision brings the order it superseded back into view. `needs-review` joined
  `AttentionFlag` rather than becoming a parallel mechanism, inheriting the chip,
  the filter and the count. **Three things the browser found that the build did
  not**: `products/page.tsx` had its own `FILTERS` allow-list beside the type
  union, so the new chip changed the URL and the page ignored it; the line-items
  table pushed the *page* sideways at 390px because the flex column and the
  section between it and the grid both defaulted to `min-width: auto` (`min-w-0`
  on both); and the table had no scroll affordance, so it now uses the same
  `useEdgeFades` hook as `DataTable`, with "+ Add line" moved outside the
  scroller. Measured: description input 88px → 228px, header collisions 2 → 0,
  page overflow at 390px → none, and zoom 100% → 200% moving the image
  514px → 1028px inside the card. **Delivery date and buyer reference** are gone
  from every screen, from the extraction schema and from the prompt; the Prisma
  columns stay, so the data on 400 existing orders survives and the decision is
  reversible. **Not verified in a browser:** the PDF zoom path — every seeded
  document returns `NoSuchKey`, so the only document that loads is a freshly
  uploaded one, and the one used for this test was an image, which exercises the
  `<img>` branch. All test data was removed afterwards: 400 purchase orders, 406
  documents, 12 products, roles reverted, no stray R2 objects.
- 2026-09-07: Phase 10 — account settings and person avatars — built, verified and merged
  (`feature/settings-and-avatars`), then **deployed to production** (Vercel Ready, 1m
  build, so `prisma migrate deploy` applied its migrations to the production Neon
  branch). `/settings` with a Profile card (picture, display name, read-only
  email/role/member-since) and a Security card (password with its last-changed date,
  sign out on all devices), reached from the account menu, never a nav row. Pictures
  come from three sources — an uploaded photo, a generated DiceBear avatar in one of
  five styles, or initials — all converging on one 256×256 WebP in R2 behind a stable
  `?v={hash}` URL, which is what makes the `immutable` cache header safe. One
  `PersonChip` now covers every place the portal names a person; the Activity card,
  "Confirmed by" and "Moved here by" gained avatars and `initials` went from four
  copies to one. **DiceBear renders locally and never over HTTP** — verified in the
  browser, zero requests to `api.dicebear.com`; three of the five styles (`gaze`,
  `voxel-bot`, `clay`) are absent from the API's own `/10.x` index while shipping fine
  in npm. Two library facts found by running it: option names are
  `` `${component}Variant` `` (passing `{ shape: [...] }` throws), and a raw definition
  passed to `Avatar` is deprecated in 10.7.0, so each is wrapped in `new Style(...)`
  once at module scope. **Four defects the build could not catch**: `useSession` had no
  `SessionProvider` anywhere in the app; the sidebar read name and image from the JWT,
  which only re-reads the database every five minutes, so every table showed the new
  avatar while the shell showed the old one (the layout now reads the row); **~1 MB of
  DiceBear was being shipped to the browser** because a client component imported the
  id list from `avatar-styles`, fixed by splitting `avatar-style-ids.ts`; and the style
  chips were 39px on a phone. **`googleImage` was added and then removed at the user's
  request**, taking "Use my Google photo" with it — it cannot work without somewhere to
  keep the Google URL, and a button that always fails is worse than none. `image` is
  still deliberately not written on a Google sign-in for an existing user, which is
  what lets an uploaded avatar survive. Known: `croodles` and `notionists` are close to
  illegible at the 24px the PO table uses — measured before building and accepted.
- 2026-09-07: Product matching built, verified and merged (`feature/product-matching`) —
  prompted by a reported upload failure that **did not reproduce**. "The upload was
  interrupted — check your connection" comes from exactly one place, `xhr.onerror` on
  the browser's PUT to R2, which fires only for a network-level failure with no HTTP
  status; a refused upload would have said "Storage refused the file (403)". Four
  uploads from a clean browser all succeeded, presign → PUT → complete all 200, so it
  was most likely an extension or a transient blip in the reporter's own browser.
  **The intake loop was proven end to end for the first time**: a realistic PO —
  Pacific Timber Sdn Bhd, three catalogue SKUs, RM 13,100.00 — was rendered, uploaded,
  read, reviewed, confirmed and rolled back, with every field correct and the totals
  gate agreeing, and **the document preview rendered** — the first time one ever has,
  since it is the first document whose R2 object actually exists. **What the test found
  is that product matching had never been implemented.** `toDraft` hardcoded
  `productId: null`, so every line of every PO arrived "Unmatched" and a reviewer picked
  each product by hand — twenty pickers on a twenty-line order — even where the document
  printed the exact catalogue SKU. The extraction schema never captured the SKU and the
  prompt never mentioned it, so the column was read and discarded. Fixed: `sku` added to
  `PoLineItemSchema` (nullable, never optional — a missing key means the model forgot the
  field, and treating that as "no code" would quietly stop matching) and to the prompt,
  which now names the column's aliases and forbids deriving a code from the description.
  `matchProducts` resolves by exact SKU first, then exact case-insensitive name, in **one
  query for the whole document** rather than one per line. Exact only, never fuzzy —
  silently attaching a line to the wrong product misprices an order and the reviewer
  cannot see it happened; archived products are excluded and two active products sharing
  a name match neither. Verified live: all three lines resolved, the form showed them
  pre-selected, the confirmed order carried the right `productId`s. Buyer matching is
  unchanged and still correctly declines a near miss ("Pacific Timber Sdn Bhd" vs
  "Pacific Timber"). All test data removed afterwards — 4 documents, 1 purchase order,
  its line items and stage event, and all 4 orphaned R2 objects. **Known, unfixed:**
  Claude rejects images over 8000px on a side and nothing in the app guards against it,
  so a phone photo can fail extraction with a raw API message.
- 2026-09-07: R2 CORS origins doc fix merged (`fix/r2-cors-origins`) — the bucket policy
  listed `lovinghandsportal.com` but not `www.`, so a presigned PUT from the www host
  failed its preflight while localhost and `*.vercel.app` worked. Documentation only;
  the policy is applied in the Cloudflare dashboard.
- 2026-09-06: Weekly labels and the drawer clamp complete and merged (`feature/weekly-labels-and-po-edit`) — two reports on 2026-09-06. **A weekly axis labelled `6 Jul` reads as Monday's takings rather than the week's**, and the tooltip inherited the ambiguity; weeks start Monday, so the label now runs Monday to Sunday — `6–12 Jul`, or `29 Jun–5 Jul` where the week crosses a month, with the year left off because the range header above every chart already carries it. The bucket *key* is unchanged, so nothing that joins on it moved, and one label source feeds the sales, stage, buyer-trend and product-trend charts, so all four changed together. Two follow-ons the wider label forced: `ChartScroller`'s floor was a flat 24px a bucket — enough for `6 Jul`, nowhere near enough for `31 Aug–6 Sep` — so it now sizes from the longest label, counting only the ticks the axis will really print; and the `Math.ceil(n / 12) - 1` interval formula that decides that, duplicated in three charts, became `axisInterval` in `charts/labels.tsx` so the scroller and the axes cannot drift. The tooltip read `27 Jul–2 Aug — RM 252,487.41`, two dashes side by side, so its separator became the `·` used everywhere else. **The second report — "I can't edit" on the PO detail page — was not the edit sheet.** It opened correctly (page dimmed, ✕ present, the whole form inside) but the panel was **12px wide and off the right edge**. Tailwind v4 resolves `max-w-<name>` against `--spacing-<name>` before `--container-<name>`, and this system names its spacing steps `xs`, `sm`, `md`, `lg`, so the compiled CSS was literally `.max-w-sm{max-width:var(--spacing-sm)}` — **12px, not 24rem** — and `.max-w-xs` 8px, `.sm\:max-w-lg` 24px. **Every Sheet, Dialog and Tooltip in the app was clamped, and had been since Phase 01**: `sheet.tsx` is untouched since install and `tailwindcss: "^4"` floated to 4.3.3. `--container-panel-xs|sm|md|lg` are names the spacing scale cannot shadow, mapping 1:1 onto the sizes the primitives asked for; recorded in `context/design-system.md` beside the ink-tertiary deviation. Two further traps, both measured rather than assumed: `data-[side=right]:sm:max-w-*` outranks a caller's plain `sm:max-w-*` on specificity, so the drawer opened at 384px while asking for 512px — and *removing that prefix did not fix it*, because tailwind-merge does not treat `max-w-panel-sm` and `max-w-panel-lg` as one conflict group, keeps both, and lets stylesheet order hand it back to `panel-sm`; `SheetContent` now applies its default in code, guarded on whether the caller supplied a `max-w-`. Verified: the drawer opens at 512px on desktop and 75% of the viewport on a phone, and a real edit saved, toasted, appeared in the summary and logged to Activity as "Edited: buyer reference" before being rolled back (the two audit entries remain, which is correct); weekly labels checked at 9, 14 and 53 buckets, the 53-week axis thinning to every fifth tick with no overlap; a sweep over 9 routes × {390, 768, 1440} clean on all 27.
- 2026-09-06: `poDate` range boundary fixed and merged (`fix/po-date-range-boundary`) — carried as "known, not fixed" since the dashboard-charts brief, where Last 30 days showed **38 purchase orders and RM 737,667.95** in the KPI, the summary and the table but **RM 673,967.79** in the daily chart. **Not a chart bug and not two queries:** both figures came from the same fetched rows. `poDate` is `@db.Date`, and a timestamp parameter compared against a `date` column is truncated to a **UTC** calendar date — midnight on 8 Aug in Kuala Lumpur is `2026-08-07T16:00:00Z`, whose UTC date is the **7th**, so `gte` admitted a whole extra day. Confirmed by binding the bounds directly: `gte 2026-08-07T16:00Z` returned **38** rows, `gte 2026-08-08T00:00Z` returned **35**. `salesSeries` then dropped the three 7 Aug orders (RM 63,700.16) because their KL bucket key was not on the axis — correctly; the query was a day too wide, not the chart. The `to` end was always right (23:59 KL is 15:59 UTC the same day), which is why only the opening day was ever wrong and why the weekly view appeared to agree — the extra day fell inside a bucket it happened to draw. `dateColumnRange` in `src/lib/dates.ts` returns UTC midnight of each end's KL calendar day, making the truncation a no-op; applied to all nine `poDate` range filters, including the raw `UNION` behind the purchase-order list, its count and its total. Verified against the live database: KPI and chart totals agree for every preset × aggregation with **zero orders outside their buckets**, and the boundary is exact both ways — `from=2026-08-07` returns the three orders, `from=2026-08-08` returns none. **The dashboard's headline figures changed as a result**: Last 30 days is now 35 orders and RM 673,967.79. The old numbers counted a day outside the range the page claimed, and the comparison period no longer overlaps the current one, so the "vs. previous period" delta moved too.
- 2026-09-06: Mobile and engagement pass complete and merged (`feature/mobile-and-engagement`) — the 2026-09-06 `/ui-review` request, the third of the day. Desktop passed; **mobile failed**, and three findings were unreadable rather than merely cramped. One measurement caused most of it: the shell left **246px of a 390px viewport** for content (64px icon rail + 40px padding a side), which is why the buyer trend chart had **86px of plot for 13 buckets** and `StageStepper`'s `grid-cols-6` handed **29px cells to 48–73px labels** ("Ipeodductpiassveedhouse"). The rail is gone below `lg` — `MobileTopBar` (wordmark + account, sticky, painted into the top safe-area inset) and `MobileTabBar` (four 56px destinations, fixed, `env(safe-area-inset-bottom)`), with `NAV`/`isActive` extracted to `components/portal/nav.ts` so the two navs cannot drift — and `main` steps `p-md sm:p-lg lg:p-xl`. Content went to **350px**, which is what made everything else fixable without special-casing. Shipped: `ChartScroller` (a floor of `axisWidth + buckets × 24px`, scrolled inside the card with edge fades, round all four Recharts charts — dashboard sales plot **86px → 768px**), the stepper vertical below `sm` sharing one `StageNode` with the canvas's horizontal track above, `DataTable` card mode below `md` (title from column one, the rest a `<dl>`, `mobileHidden` dropping both avatar columns from the PO list, sorting moved to a select since a card has no header to click — all five consumers at once), `SegmentGroup` replacing five copies of one strip class that clipped instead of scrolling and alone caused the dashboard's **122px** and Products' **38px** document overflow, two-up KPI rows with `break-words` (Top buyer clipped to "Northwii Traders" at 768px) and `mobileFull` for money (**"RM 29,175.52" measures 161px against 125px** of a half tile, and the spec forbids wrapping money), 44px touch targets below `sm`, `SkipLink`, and a `viewport` export with `viewportFit: "cover"` — without which every safe-area inset is 0. Engagement: `WorkQueue` leads the dashboard, reading `data.intake` which was already loaded and unused, and **renders only when there is work**, so it is not the always-on intake bar deliberately removed earlier the same day; its links carry no date range because a draft has no `poDate`. "hover a point" → "tap or hover"; the sales area fill went from ink at 0.06 (invisible) to the brand purple while the line and extremes keep their meanings; Upload leads with **Take a photo** and a rear-camera `capture` input below `sm`; product cards two-up. **`--color-primary` computed to `#292d34`, not `#7612fa`** — the `@theme inline` block re-declares it as `var(--primary)` and `:root` points that at ink, so **no focus ring in the app had ever been purple** since Phase 01; ink is right for `bg-primary`, so the rebinding stays and the ring moved to a new unshadowed `--color-focus`, 37 files swapped, recorded in `context/design-system.md`. The `DataTable` edge-fade logic came out into `useEdgeFades` rather than being written twice. Verified by a scripted sweep over 8 routes × {390, 768, 1440}: zero horizontal overflow, zero clipped text, zero sub-44px standalone controls on phone, all 24 combinations clean; 326 tests, build and lint pass. Prettier reformatted ~40 files it was not asked to touch (semicolons across every shadcn primitive, imports re-wrapped in `ReviewForm` and `useUploadQueue`); every formatting-only diff was reverted before commit. **Known, not fixed:** a KPI row mixing half tiles with a full-width money tile leaves one empty cell where the money tile starts a new row — every fix trades away either the canvas's tile order or DOM/reading order.

- 2026-09-06: Dashboard interactions brief complete and merged (`feature/dashboard-interactions`) — the second 2026-09-06 `/ui-ux-pro-max` request. **Count-up is back**, at 2s, after being cut that morning; the rule that made the old one unsafe is fixed rather than repeated, so the server figure is the initial state and the first paint, the count runs after mount, a range change continues from the frame on screen instead of restarting at zero, and `prefers-reduced-motion` skips it (`useCountUp`, `CountUp`). It covers the KPI tiles on every page, the six "In this range" tiles, the product KPI row and the single-metric card headings, but not chart labels or table cells. Donut legends link every named slice to its detail page and **"Other (n)" unfolds in place**, `shareBy` keeping the folded members with their share *of the whole* so an unfolded row ranks on the same scale as a top-five slice; the ring keeps one grey Other arc, because unfolding it into arcs would need hues past the six the palette validates. The same treatment went to the What-they-buy bars, and product names in the price-drift list became links. The **sidebar is `sticky top-0`** — a plain `h-dvh` aside stopped at the fold and left its surface and right border hanging mid-page. **Easing took three passes and the exponent was never the problem:** cubic, then quadratic, were both reported as not feeling like they slowed down, because the figure repainted on every frame to the last one, and sixty changes a second is a blur whatever the curve does to the increments. The repaint rhythm now decelerates too — every frame at the start, widening to 150 ms gaps — measured at 35 paints over 1.9 s with final steps RM 14,467 → 181, and Purchase orders counting 0 → 38 through 29 integers with its last gaps at 192 and 242 ms. Three other defects fixed: the mount animation was skipped **in development only**, because React double-invokes effects and the second pass read a start ref the cancelled first pass never wrote; the first frames rendered **negative money** ("-RM 8,851.78" under Total sales) because an animation frame already in flight carries a timestamp from before the effect ran, making progress negative under an ease-out; and linking the PO number in the product order history nested `<a>` inside `<a>` and failed hydration, since `DataTable` already wraps the first cell of every row in a link to `rowHref`.
- 2026-09-06: Dashboard charts brief complete and merged (`feature/dashboard-charts`) — the first of two 2026-09-06 `/ui-ux-pro-max` requests. The trend card split into two: **Sales over time** with a *Sales · Quantity* switch (`?measure=`, Quantity summing line-item units through `pickMeasure`), then **Order stage**, the stacked stage chart headed "27 orders still open" with the confirmed count dropped and the 14px stage bar — counts and links intact — moved under it as its legend. The Status-breakdown *intake* bar left the dashboard; that backlog is read from the Purchase orders chips. Every Recharts chart (dashboard sales and stage, buyer product trend, product price trend) now animates 800 ms ease-out on load and on data change and carries whole-number value labels, drawn by one `content` renderer in `src/components/charts/labels.tsx` that hides zero buckets and spaces labels from the plot width. Sidebar label became **Purchase Orders** (title case, the one deliberate exception to the sentence-case rule, at the user's request) and the wordmark links to `/`. Six defects found and fixed: stage totals vanished on bars whose top segment was zero, so the totals ride an invisible `Line` — a `LabelList` on the top segment goes missing wherever that segment is zero, and every segment is zero somewhere; that line then leaked into the tooltip as an unnamed ": 8", so the tooltip filters its payload to stage keys; labels sampled every nth index skipped busy days, so `labelledIndices` walks the busy buckets instead; the quantity y-axis printed `931.84000000001` from the 1.12 headroom multiplier; end-point labels ran into the axis and the card edge; and the average and list-price reference labels were positioned at `"right"`, off the svg, so they had never been visible at all. **Known, not fixed:** `poDate` is `@db.Date` and the range filter is cast to a UTC calendar date while buckets are built in Kuala Lumpur time, so on "Last 30 days" three orders dated 7 Aug sit in the KPI, the summary and the table (38 POs, RM 737,667.95) but outside the daily chart (RM 673,967.79); the weekly view agrees because the week of 3 Aug is a bucket. The fix belongs in every query that filters `poDate` by range, not in a chart.
- 2026-09-06: Click-feedback pass complete and merged (`feature/click-feedback`) — the 2026-09-06 `/ui-ux-pro-max` request. **Tailwind v4's preflight sets `cursor: default` on `<button>`**, so every chip, segment, sort header, pill and icon button showed an arrow while links showed a hand; one rule in `globals.css` `@layer base` now gives enabled buttons, `[role=button]`, `<summary>`, selects and checkbox/radio/file inputs the pointer and disabled ones `not-allowed`, so no component carries `cursor-pointer` itself. A busy button gets `progress` rather than `not-allowed`, scoped to the control so rows inside an updating table keep the hand. The brief's G1 had shipped the top progress bar and the "Updating…" hints but nothing on the element you clicked — a chip reads its selected state from the URL, and the URL only changes once the server answers, so it sat untouched for the whole round trip. Shipped: `Spinner`, one 14px `currentColor` ring on a 0.8s loop (the ring Sonner already spins, never the brand gradient, slowed rather than stopped under `prefers-reduced-motion`); `usePendingChoice` + `ChoiceButton`, giving range presets, aggregate segments, status and quick-filter chips, the sort strip, grid/list and the chart toggles an optimistic selection with the spinner on the clicked option and siblings dimmed under `aria-busy`, the local choice dropped when the server's value lands so a superseded write cannot leave a stale selection; `DataTable` taking its arrow and spinner on click and fading the previous rows to 60% instead of blanking them; `<Button pending>` on every button that waits; and `LinkSpinner` over `useLinkStatus` for the gap between a route click and its `loading.tsx`. Verified against the reseeded database — cursor audit clean on Dashboard (63 elements), Products (34) and PO detail (13); "Last 60 days" flipped and spun with siblings dimmed, settling in ~340 ms; sorting Total took the arrow and released PO date's in the same frame; Next paged with rows at 60% while "Page 1 of 41" held. The zero-count tiles on the Buyers attention strip keep `cursor-default` deliberately — an empty category is nothing to fix, not something forbidden — and gained the "Nothing to fix here" title the Products tile already had. **R2 now authenticates** and signs presigned URLs correctly, but the seed writes `Document.r2Key` values without uploading files, so every seeded document returns `NoSuchKey` and still shows the preview error state; a real upload has never been run end to end.
- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-06: Phase 09 complete and merged, closing the spec set — the `(admin)` shell with its own top bar and a `requireSuperAdmin()` check behind the Phase 02 proxy rewrite, pending access requests with approve/decline wired to the Phase 02 emails, the users table with status derivation and the reset-password split, and `UserDrawer` with create, update, set password and soft delete. Verified against the seeded database: approving a pending request created the user as MEMBER, marked the request APPROVED with the decider and timestamp, and hid the empty section; the delete dialog stayed disabled for a near miss and a prefix and enabled only on the exact address (case-insensitive, trimmed); Pending and Invited render as neutral text in amber rings, distinct from the amber-text "Needs review" badge; a Google-only user shows "Password managed by Google" with an explanatory title and no reset link. All test data was removed afterwards. 19 tests cover the safety rules — no self-demote, no self-disable, never the last *active* super admin, `sessionVersion` bumped on disable and on set-password, and soft delete keeping the row so uploads and stage events stay attributed.
- 2026-09-06: Phase 08 merged, image editor deferred — `twelveMonthWindow` exported once so the KPI row, the cards, the footer summary and a product's order history cannot read different windows; `productStats`, `priceTrend`, `whoBuysIt`, `boughtTogether`, `needsAttention`; the catalog with a clickable Needs-attention breakdown driving the quick-filter chips; product detail with six stat tiles, price trend against the list line, who buys it, bought together and order history; `ProductSheet` for create/edit/archive with `ProductPrice` appended only when the price moves. Verified: the unfiltered KPI row and footer read identically, the Orders tile matches the history row count on two products (139 and 134), the below-list highlight carries both figures in `title` and `aria-label`, and editing a list price left the old value in history. Four defects fixed: the KPI row and footer differed by 9.3e-10 because float addition is not associative and the footer sums a sorted copy; the footer offered "10 per page" beside twelve cards; images that failed before hydration kept a broken icon because `onError` is never replayed; and my product categories were invented rather than taken from the seed, so four of seven did not exist. **The image editor is deferred** — see the status note above.
- 2026-09-06: Phase 07 complete and merged — the buyer analytics (`reorder`, `buyer-status`, `product-mix`, `product-trend`, `sparkline`) with 25 tests, the roster whose attention counts and table filter are one control, and buyer detail (five KPIs, order trend, product trend with a six-product picker, what-they-buy donut and bars, reorder signals linking to a preselected upload, a details card that renders no blank rows, intake bar, their POs). Buyer names became links everywhere. Three defects found and fixed: `listBuyers` pulled every line item's quantity, amount and product name when the roster needs product ids alone, costing 2.1s against 0.28s; the product picker assigned colour by position in the selected array, so deselecting the first product repainted the survivors — the URL now keeps freed slots (`?products=,b,c`) so an assignment survives a deselect; and a five-tile KPI row whose first tile spans two columns wrapped its last tile onto its own line.
- 2026-09-05: Phase 06 complete and merged — the pure analytics library (`buckets`, `range`, `sales`, `fulfillment`, `share`, `churn`, `price-drift`) with 70 tests, `loadDashboard` at 422 ms for Last year daily, and the page in its specified order: three KPI tiles, one trend card, the two status bars, the collapsed disclosure, the table last. KPI figures cross-checked against independent raw SQL — 400 orders, RM 8,161,352.29, 11 buyers. Three defects found and fixed: `buckets.startOf` never truncated the time for daily aggregation, so Last 30 days ending now drew 31 columns; the donut and line-chart palettes reached for `--color-primary`, which shadcn's `@theme inline` block rebinds to ink, so the validated hues were never the rendered ones (now unshadowed `--color-share-1..6`); and Recharts' default bar animation meant a screenshot caught an empty plot, the same failure the KPI count-up rule exists to prevent. **Known, not fixed:** `--ring` is set from `--color-primary` and is therefore ink rather than the purple the design system specifies — a Phase 01 issue affecting every focus ring in the app.
- 2026-09-05: Phase 05 complete and merged — the shared table machinery (`DataTable` taking `onSortChange`, `TablePagination`, `parsePagination`/`parseSort`, status and stage badges), the merged list over `PurchaseOrder` and `Extraction` as a parameter-bound `UNION ALL`, the filter row with live chip counts, and the detail page (breadcrumb, Lifecycle card, `StageStepper` with the breathing loop, document/data split, Activity, revisions, edit sheet). `advanceStage`/`revertStage` guard the update on the stage the caller last saw. Verified against the seeded data: advance, super-admin move back with a required note, and an edit appearing in Activity — all rolled back afterwards. **Criterion 4 is unverified** (R2 placeholder) and criterion 8 is covered by unit tests rather than two real tabs. The database caught three things the types could not: Postgres refuses an `ORDER BY` over a `UNION` that uses an expression rather than a result column name; "Confirmed by" ascending sorted the backlog to the bottom because ASC defaults to NULLS LAST, not NULLS FIRST as my comment claimed; and clearing the filters left the search text in the box. Two review findings from the first half were also fixed before shipping: `DataTable` hardwired its own URL writing, which would have stopped Phase 08's segmented control sharing sort state, and `StatusDot` took a `text-*` class where a background was needed. The edit sheet deliberately omits money and line items — editing totals after confirmation would bypass the Phase 04 totals gate and its audit entry.
- 2026-09-05: Phase 04 complete and merged — `PoExtractionSchema`, the extraction system prompt, `extractPurchaseOrder` over `messages.parse` with `zodOutputFormat`, the shared `runExtraction` runner wired into `/api/upload/complete` and `retryExtraction`, `/api/documents/[id]/url`, the review screen (react-pdf source column, draft form, buyer/product comboboxes, line-item editing with amount recompute, 800 ms debounced `saveDraft`), the totals gate, the duplicate check with revision numbering, and `confirmPurchaseOrder`. **Criterion 1 is unverified** (`ANTHROPIC_API_KEY` is a placeholder) and the source column cannot load (`R2_ACCOUNT_ID` likewise); everything else was verified against the seeded Neon database, including a full confirm that wrote a PO, six line items and a System stage event before being rolled back. A review pass found four defects, all fixed: the upload queue ignored the extraction result so a document Claude could not read still showed "Uploaded" and was counted in "Review N files"; the upload footer never linked to `/review`, leaving the whole multi-file review journey unreachable; the deferred "Extracting" row state was missing; and the review form defaulted `poDate` from UTC, pre-filling yesterday between midnight and 08:00 KL. Fixing them also surfaced two more: Retry re-uploaded a file that had arrived intact rather than asking for another read, and the queue's status vocabulary lived in the hook, coupling anything that reasoned about a row to the server actions and Auth.js.
- 2026-09-05: Phase 03 complete and merged — presign / complete / delete route handlers, `deleteOrphans()`, the `useUploadQueue` state machine (three concurrent XHR uploads, live progress, `beforeunload` guard), Dropzone with drop/browse/paste, one progress-bar geometry, plain-language failure reasons, the ready-only footer count, and "Upload PO" wired on Dashboard, Purchase orders and Buyers. **Criteria 1, 3, 4 and 8's enabled state are unverified**: R2 still holds placeholder credentials, so no browser PUT can reach the bucket. Re-run them once `docs/specs/SETUP-CHECKLIST.md` §2 is done. Fixed three defects found while building: `presignPut` pinned `ContentLength` to a ceiling rather than the file's exact size (S3 signs it exactly, so every real upload but one would have been refused); the `Document.r2Key` unique constraint needed a unique `pending:` placeholder because the key contains the row's own id; and the queue pump read a ref during render and drove state from an effect.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
- 2026-09-06: UI change brief (`docs/specs/20260906_UI_change.md`) complete and merged — the 2026-09-06 Critiquito review of the live portal. **The reported "laggy / numbers jump" was the KPI count-up, not a refetch**: the recorded Dashboard readings, 13 POs / RM 254k then 38 / RM 737k, are both 34% of the final figures, which is one frame of `useCountUp`'s ease-out cubic; Buyers 2 → 11 and Products 11 → 12 were the same hook on other tiles, and the database holds 400 POs, 11 buyers and 12 products throughout. A count-up cannot satisfy the brief's rule that no headline number may look final and then change, so it is gone and the tiles render their server value only — **a deliberate departure from the canvas and from `00-master.md` §4 "Numbers render final, then animate"**. The real navigation wait had never been addressed: every portal page is `force-dynamic` and `src/app` held no `loading.tsx` at all, so a click showed nothing until the server answered. Shipped: ten route-level skeletons off a shared `Skeletons` kit; `useUrlNavigation`, through which every URL write in the app now runs, its transition driving one `NavProgress` top bar and the `UpdatingHint` in each summary line; pending labels on Advance, Move back, Approve and Decline; `BackLink` on PO, Buyer and Product detail and on Upload; two-line wrapping for the sidebar email and the Top buyer / Best seller KPIs; `--color-ink-tertiary` `#838383` → `#6f6f6f` (3.79:1 → 5.02:1 on canvas), recorded as a deviation in `context/design-system.md`; a sticky first column and scroll-edge fades in `DataTable`; `pl-md` on the PO detail numeric columns; `Download original` and `Try preview again` beside the PDF error; an "Image unavailable" tile that also catches an image which failed before hydration; the upload queue's reserved "No files yet" region; and the Dashboard intake and stage counts as links into the rows they count. Two defects found and fixed while building: those dashboard links first carried the date range on all four intake statuses, but drafts have no PO date and `listPurchaseOrders` drops the extraction branch the moment a date bound is present, so "Needs review 3" landed on an empty table — only Confirmed carries the range now, verified 3 counts → 3 rows; and `BackLink` first tested `document.referrer` alone as the brief's rule 5 says, but client-side navigation never rewrites the referrer, so Back discarded the user's filters — it now also compares `history.length` against a baseline captured in the shell when the document loaded, verified across `?status=confirmed&stage=DELIVERING` and a deep-linked product. **Not done:** per-status counts on the PO list chips (§3, Should) need a new aggregate — the list query returns `needsReview` alone. **Unverified:** the admin screen's progress bar, pending labels and skeleton are covered by build, types and lint but were not exercised in a browser, because the seeded member is not a super admin and the super admin is Google-only. R2 still holds placeholder credentials, so the PDF preview error state is what every document shows; that is the case the brief reported and it now recovers, but a successful preview was never seen.
