# Phase 50 — The mobile pass, four years of drift later

Version 1.0 — 2026-09-20. Audience: AI coders.
Read `docs/specs/00-master.md` first. Branch: `feature/mobile-ui-pass`.

---

## 1. What this is

A driven sweep of every screen a person can reach on a phone, on both hosts,
and a ranked list of what it found. It is a survey and a work order, not a
build: nothing in it has been fixed yet.

The 2026-09-06 mobile pass set this product's phone rules — no horizontal
overflow, a 44px touch floor, money never wraps — and built the shell that
enforces them (`MobileTopBar`, `MobileTabBar`, `ChartScroller`, `DataTable`
card mode, `SegmentGroup`). Since then eighteen phases have added screens
without that pass being re-run.

**The headline is good: the shell is holding.** Fifteen screens at 390 and ten
at 320 all measured `scrollWidth === innerWidth`. Not one page scrolls
sideways. Every finding below is inside that envelope — content crushed,
clipped, mislabelled or too small to hit, on pages that are themselves the
right width.

**One correction to the record.** `/purchase-orders/[id]` has been carried
since 2026-09-18 as "overflows at 390, measured 467 against 390, from the
header's Download/Edit/Delete row". It does not overflow any more. The same
row now **crushes the title instead** (§4.1) — the failure moved rather than
went away, and it is worse, because a page that scrolls sideways at least
still shows its heading.

## 2. How it was measured

Local Postgres, seeded (`npm run db:seed`: 2 staff, 11 buyers, 12 products,
421 purchase orders), driven in Chromium through Playwright at
**390 × 844** and **320 × 800**, signed in for real as two people: a `CLIENT`
against Acme Industrial Sdn Bhd on `shop.localhost:3000`, and a
`SUPER_ADMIN` on `localhost:3000`.

Per screen, four automated probes plus a look at the screenshot:

- `document.documentElement.scrollWidth` against `window.innerWidth`;
- every leaf element whose right edge passes the viewport;
- every interactive element under 44px in either dimension
  (`a[href], button, input, select, textarea, [role=button], summary`);
- every leaf text node where `scrollWidth > clientWidth` without
  `text-overflow: ellipsis` or an `overflow-x` scroller — i.e. clipped rather
  than deliberately truncated.

Screens covered: shop home, catalogue, product detail, cart, checkout review,
my orders; portal dashboard, purchase-order list, purchase-order detail,
buyers, products, upload, settings, admin.

**`sr-only` elements are excluded** from every count. They measure as clipped
and as sub-44px by construction, and three of the four probes flag them; they
are not defects.

## 3. The ranking

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | The page header crushes, and at 320 overlaps, its own title | portal, every page with header actions | **High** |
| 2 | Every order on the buyer's list is titled "—" | shop `/orders` | **High** |
| 3 | A cart line's product name overruns its card by 39px | shop `/cart` | **High** |
| 4 | A cart line's amount wraps onto two lines | shop `/cart` | Medium |
| 5 | The cart bar renders on the cart page itself | shop `/cart` | Medium |
| 6 | The category strip scrolls with no edge affordance | shop, every page | Medium |
| 7 | The account-menu trigger is 88 × 32 | shop, every page | Medium |
| 8 | The permission grid's checkboxes are 20 × 20 | portal `/admin` | Low |
| 9 | The card stepper's value box is 27px wide | shop catalogue | Low (recorded) |
| 10 | The dashboard's range presets wrap to three rows | portal `/` | Low |

Severity is reach × recoverability: a buyer who cannot tell two orders apart
is worse off than a super admin squinting at a checkbox, and a defect on every
page outranks one on a single screen.

## 4. The findings

### 4.1 The page header crushes its own title — High

The portal's page header is one flex row: title column on the left, actions on
the right. The actions are `shrink-0`; the title column is not `min-w-0` and
does not stack. So the title absorbs every pixel the buttons want.

**Measured, `/purchase-orders/[id]` at 390** (`PO-2026-0026`, Sunway
Packaging, three actions — Download, Edit, Delete):

- `h1` **clientWidth 45px, scrollWidth 124px**. "Sunway Packaging" renders as
  two stacked words in a 45px gutter.
- the eyebrow `PO number PO-2026-0026` **45px against 49px**, breaking one
  fragment per line — five lines for one reference.

**Measured, `/buyers` at 320** (two actions — New buyer, Upload PO):

- `h1` **clientWidth 16px, scrollWidth 81px** in a 280px row.
- The two buttons **paint over the title**: "Directory / Buyers" is drawn
  underneath "New buyer". Not merely cramped — obscured.

`/buyers` is clean at 390 and fails at 320; `/purchase-orders/[id]` fails at
both. That is the same bug at two budgets, not two bugs.

**Fix.** Stack the header below `sm` — title block, then the action row — the
pattern `/products/new` already adopted on 2026-09-08 and `/admin` on
2026-09-14 for exactly this reason. Give the title column `min-w-0` so that
it shrinks rather than crushing when the row does stay horizontal. This is one
change in the shared header, not a change per page; find every caller before
editing, because the two that already stack must not end up stacking twice.

### 4.2 Every order on the buyer's list is titled "—" — High

**Measured, `/orders` at 390.** Three cards; each card's title link reads
exactly **`—`**, measures **308 × 24**, and points at a different order
(`/orders/po_uet59…`, `/orders/po_2zdcx…`, `/orders/po_fv570…`).

`DataTable` card mode takes column one as the card's title *and* as the row
link. On this table column one is **Order ID**, which since the 2026-09-17
split is `—` for every purchase order that did not come from the shop — which
is every order a buyer has unless they placed it themselves. The value that
identifies the order, "Your PO number", is demoted to a row inside the card.

So on a phone the buyer sees a stack of identical dashes and taps one to find
out which order it was. On desktop the same table is fine: all six columns are
visible and the dash is just one empty cell.

**Fix.** Card mode needs to be told which column titles the card, rather than
always taking the first — a `mobileTitle` column key on `DataTable`, with
`/orders` passing "Your PO number" and falling back to Order ID where the PO
number is itself blank. Never render a card whose title is the empty marker:
if both are blank, the date is a better title than a dash.

### 4.3 A cart line's product name overruns its card — High

**Measured, `/cart` at 390.** The line's name element
(`500ML FINE FRAGRANCE SHOWER GEL — Style`) has **right edge 409px** while its
own card ends at **370px**. It computes `overflow: visible` and
`text-overflow: clip`, so it is not truncated — it runs out of the card, past
the page's gutter, and is cut by the viewport. On screen it reads
`500ML FINE FRAGRANCE SHOWE`.

The page does not scroll sideways, which is why the overflow probe never
caught this: the text is clipped rather than pushing the layout.

**Fix.** The name's flex parent needs `min-w-0` (a flex item's default
`min-width: auto` refuses to shrink below its content — the trap this codebase
has now hit on `/admin/buyers/[id]`, the PO line-items table, and here). Then
`break-words`, so a long product name wraps inside the card rather than
truncating: on the cart the name is what the buyer checks, and
`00-master.md` §4's truncation-recovery rule wants the full value reachable.

### 4.4 A cart line's amount wraps onto two lines — Medium

**Measured, `/cart` at 390.** One money element renders **56px wide and 48px
tall across two lines** — `RM` above `312.00`. Three other `RM 312.00`
elements on the same page are single-line at 86, 124 and 168px.

`00-master.md` §4 says money does not wrap; the 2026-09-06 pass added
`mobileFull` to KPI tiles for exactly this. The cart line row never got it.

**Fix.** `whitespace-nowrap` on the amount and `shrink-0` on its cell, with the
name column (§4.3) taking the shrink instead. Both findings are the same row
and should be fixed together, in one change: widening the name at the amount's
expense is how the amount started wrapping.

### 4.5 The cart bar renders on the cart page itself — Medium

**Measured:** on `/cart` at 390 the bar is present, its pill 48px tall, and it
offers **View cart** — a link to the page the reader is on. With its safe-area
padding it covers roughly 72px of the bottom of the viewport, which on this
page is the order summary.

**Fix.** The decision is the user's, and there are two defensible answers:
hide the bar on `/cart` (and on `/checkout/*`, where it is a backward action
beside a commit — it was demoted from ink to secondary on 2026-09-20 for that
reason), or keep it and change its label and target per route. Hiding is
simpler and loses nothing: the cart page already has its own **Review and
send**.

### 4.6 The category strip scrolls with no edge affordance — Medium

**Measured,** every shop page at 390: chips sit at right edges of **398, 492,
621 and 778** against a 390 viewport, inside an `overflow-x: auto` scroller.
The strip scrolls correctly — the page does not — but the screenshot shows the
fourth chip cut mid-word at the screen edge with no gradient, arrow or shadow
to say so. A reader has no signal that four more categories exist.

`DataTable` solved this in 2026-09-06 with `useEdgeFades`, and the hook was
extracted to be shared. The category strip does not use it.

**Fix.** Apply `useEdgeFades` to the strip. No new mechanism.

### 4.7 The account-menu trigger is 88 × 32 — Medium

**Measured** on six shop pages: the header's account button computes
**88 × 32**, against this product's 44px floor. It is the only route to
Change password, My orders and Sign out on a phone.

It is not on the accepted list: that list covers the `SkipLink`, the wordmark,
the 32/36px search and category chips, footer rows, and `DataTable` card-mode
title links. This is a menu trigger, and the 2026-09-06 rule was written for
exactly this kind of control.

**Fix.** `h-11` below `sm`, keeping its current size from `sm` up so the
desktop header does not grow.

### 4.8 The permission grid's checkboxes are 20 × 20 — Low

**Measured, `/admin` at 390:** the grid's checkbox inputs compute **20 × 20**.
Phase 48 records that the grid becomes a role picker on a phone "with 0 targets
under 44px"; the picker's own controls clear the floor, but the checkboxes it
reveals do not.

**Fix.** Wrap each checkbox in a 44px label that toggles it. The visual box
stays 20px; the target does not.

### 4.9 The card stepper's value box is 27px wide — Low, already recorded

Unchanged since 2026-09-18, where it was measured, reasoned about and
deliberately left: two 44px buttons inside a 165px two-up card leave 27px for
the value. Widening it means one card per row on a phone. **Re-raised only so
this list is complete** — it is a catalogue-layout decision, not a bug, and it
should not be "fixed" as part of this phase without that decision being made.

### 4.10 The dashboard's range presets wrap to three rows — Low

**Observed** on `/` at 390: the five range pills wrap across three rows and,
with the Aggregate strip under them, put roughly 130px of controls above the
first figure. Every other strip in the product scrolls in one row
(`SegmentGroup`); this one wraps.

**Fix.** Either run it through `SegmentGroup` so it scrolls in one row like its
siblings, or accept the wrap and say so here. Lowest value in this list.

## 5. What is explicitly not a finding

These were measured, are under 44px or past the viewport, and are correct:

- **`sr-only` content** everywhere — excluded by construction, see §2.
- **The accepted sub-44px classes** from 2026-09-11 and 2026-09-10: the
  `SkipLink`, the wordmark, the 32/36px search field and category chips,
  footer rows at 18px, and `DataTable` card-mode title links at 24px.
- **Recharts geometry past the right edge** on the dashboard (measured to 868
  against 390) — that is `ChartScroller` doing its job.
- **The admin role buttons** at right 490 and 577 — a deliberate scroller.
- **Page width itself**, on all fifteen screens at 390 and all ten at 320.

## 6. Acceptance criteria

1. `/purchase-orders/[id]` at 390 and `/buyers` at 320 render their `h1` at
   its natural width, with no element painted over it, and the actions below
   the title. Re-measure `scrollWidth` against `clientWidth` on both `h1`s and
   on the PO eyebrow: they must be equal.
2. `/orders` at 390 titles every card with something that identifies the
   order. No card's title is `—`.
3. A cart line's name renders inside its card — right edge no greater than the
   card's — and wraps rather than clipping; its amount renders on one line.
   Both measured at 390 and 320 with the longest product name in the
   catalogue.
4. `/cart` carries exactly one route onward and no link to itself.
5. The category strip shows an edge affordance whenever it is scrollable, and
   none when it is not.
6. The shop account-menu trigger measures at least 44px in both dimensions
   below `sm`, and is unchanged at `md` and above.
7. Every screen in §2 still measures `scrollWidth === innerWidth` at 320, 390
   and 768 afterwards — the envelope this phase inherited is not spent paying
   for these fixes.
8. `npm run build`, `tsc --noEmit`, lint (the two pre-existing `username`
   warnings only) and the full test suite stay clean.

## 7. Not covered by this sweep

- **Anything on production.** Local database, seeded data, Chromium.
- **A real device.** Chromium at a phone viewport is not a phone: it does not
  test the on-screen keyboard covering a focused field, momentum scrolling,
  iOS Safari's collapsing toolbar, or a real thumb's accuracy. Findings 1–4
  are geometric and will hold; 5, 7 and 9 are judgements a device may change.
- **Landscape**, and any width between 390 and 768.
- **Screens that need data this database has none of:** `/review/[id]`
  (every seeded document 404s from R2, so no scan can be re-extracted),
  `/web-orders/[id]` beyond the one order this sweep placed, and a declined
  order anywhere.
- **A member's view.** Everything portal-side was read as a super admin, so
  screens that hide actions by role were measured with every action present —
  which is the worst case for §4.1 and the right one to design against.
- **Colour contrast, focus order and screen-reader output.** This was a
  layout and touch-target sweep. The `ink-tertiary` deviation of 2026-09-06
  was a contrast fix; nothing here re-checks that work.
