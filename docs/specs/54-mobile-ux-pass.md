# Phase 54 — The mobile pass

Asked for as: "scan through mobile version, I think the mobile version is not
friendly, there's a lot of overlay and inconsistency in mobile version. Please
test it as real user and think of how to maximize the user experience."

**Spec first. Nothing below is built.**

---

## 1. How this was measured

Not read off the code, and not rendered from fixtures: **the real app, signed
in as a real user, driven in a real browser.**

- A local Postgres 16 cluster, the project's own 25 migrations and its own
  seed — **423 purchase orders, 1,683 line items, 12 products, 11 buyers**.
  Three markets were written onto the catalogue and three products left with
  none, so the market analytics have something to draw.
- `src/lib/prisma.ts` and `prisma/seed.ts` were pointed at a local adapter for
  the drive and **are to be restored before anything is committed** — the same
  swap Phase 53 recorded. `package.json` and `package-lock.json` are untouched.
- `npm run dev`, signed in through the sign-in form as a super admin.
- Chromium at **390 × 844, deviceScaleFactor 2, `isMobile`, `hasTouch`**, with
  an iPhone user agent. Every page was given 3.2s to settle, past the KPI
  count-up — the measurement trap recorded on 2026-09-22.
- Sixteen routes walked. Each one measured for horizontal overflow, sub-44px
  touch targets, clipped text with no `title`, console errors, and — the test
  that answers "overlay" — a **hit test**: every control is scrolled to the
  centre of the viewport and `elementFromPoint` is asked whether that control
  is what a thumb would actually land on.

---

## 2. What is already right, and must not be churned

Written down so this phase does not "fix" things that work.

- **No horizontal overflow anywhere.** All 16 routes measure
  `scrollWidth === innerWidth` at 390. The 2026-09-06 pass holds.
- **The fixed tab bar does not eat the end of a page.** The portal layout
  reserves `3.5rem + env(safe-area-inset-bottom)` with a spacer div. I expected
  this to be the first defect and it is not.
- **The skip link works.** It is `z-50` when focused, above the `z-30` sticky
  top bar, and the hit test confirms it is reachable — it is the first tab
  stop on every page. (At rest it reads as "covered" because it is `sr-only`;
  that is a false positive, recorded here so nobody re-derives it.)
- **Both safe-area insets are handled** — top bar paints into the notch,
  tab bar into the home indicator.
- **The console is clean.** The only failed request is
  `va.vercel-scripts.com/v1/speed-insights`, this container's blocked egress.

**There is almost no literal overlay.** The hit test found exactly one control
in the whole portal that a thumb cannot land on (F6 below). What reads as
"overlay" is F1 — a title crushed into a 45px column by the buttons beside it.

---

## 3. Findings, worst first

### F1 — The page title collapses beside its own actions · **the big one**

`PageHeader` is used by **11 pages**. Measured `h1` at 390:

| Page | h1 width | h1 height | lines | title |
|---|---|---|---|---|
| Buyer detail | **76px** | **125px** | **4** | Acme Industrial Sdn Bhd |
| PO detail | **45px** | 62px | 2 | Orchid Textiles |
| Demand board | 132px | 62px | 2 | What is committed |
| Buyers | 86px | 31px | 1 | Buyers |
| Product detail | 350px | 31px | 1 | ZEN 2.1L — Lavender |
| Upload, Review, Dashboard | 209–350px | 31px | 1 | — |

"Acme Industrial Sdn Bhd" sets as **Acme / Industrial / Sdn / Bhd** in a 76px
column with **274px of empty space beside it**. On PO detail the three actions
(Download 109px + Edit 67px + Delete 85px = 261px of a 350px content width)
leave the title 45px.

**Root cause, and it is one line.** The header was made `flex-wrap` on
2026-09-06 precisely so the action would drop under the title. It never does:
the title column is `min-w-0 flex-1`, and `flex-1` sets `flex-basis: 0%`, so
the column shrinks to nothing rather than overflowing the row — and a row that
never overflows never wraps. **The comment in `PageHeader` describing the wrap
is wrong**; the wrap has never fired on a phone.

**Fix:** give the title column a real basis so the row must wrap below `sm` —
`basis-full sm:basis-0 sm:flex-1`. One shared component, 11 pages, no
per-page edits.

### F2 — A record costs 550px, and half of it says nothing

`DataTable` drops to card mode below `md`. On `/purchase-orders` one queued
scan renders **7 label/value rows in ~550px** — and for a scan not yet
extracted, **four of them read `—`, `—`, `0`, `RM 0.00`**.

- **1.4 records per screen.** `/purchase-orders` is **5,083px — 6 screens**
  for 10 rows; `/buyers` 4,580px; `/products` 4,078px; the dashboard
  **6,596px, 7.8 screens**.
- The delete icon sits alone, centred, at the foot of each card, detached from
  the row it acts on.

**Fix:** card mode shows a **summary, not a transcription** — title line,
status, and the two or three facts that identify the record (buyer, total,
date). A field whose value is `—` is **omitted on a card** rather than printed;
on a phone a dash is a row of nothing, where in a table it holds a column open.
Everything else moves to the record's own page, which is one tap away.

### F3 — Card titles are 21–24px tall, under the project's own 44px floor

Counted at 390: **27 links at 308×24** (card titles), **12 at 170×21** (buyer
names), plus product names at 155–192×21. The 2026-09-06 pass set a 44px floor
and these have been carried as an "accepted class" ever since.

They should stop being an accepted class, because the fix is not "make the link
taller" — **the whole card should be the tap target**, with the title as its
accessible name. That is the pattern a phone user expects and it removes 40+
sub-44px controls in one change rather than padding each one.

### F4 — You scroll past the controls to reach the content

| Page | controls before the first record | first record at |
|---|---|---|
| Demand board | 10 | **y = 553** of 844 |
| Purchase orders | 24 | y = 80 (but behind the queue section) |
| Dashboard | 11 | y = 80 |
| Buyers | 9 | y = 80 |

The demand board spends **65% of the first screen** on five stacked control
rows — Grain, Window, "or up to" date, search, product select — before one row
of the board. The board itself then scrolls sideways, so at rest a phone shows
*Product* and *Overdue* and not a single week column.

**Fix:** below `md`, collapse the secondary filters behind one **"Filters"**
button that opens a sheet, with a count of how many are active. The primary
control for the page (grain on the demand board, the range on the dashboard)
stays visible. The board's own first data column comes into view without a
sideways scroll.

### F5 — The one date input in the app speaks American

The demand board's "or up to" field renders **`mm/dd/yyyy`** — a bare
`<input type="date">` taking the browser's locale — on a page where every other
date reads `22 Sep 2026`. This is the clearest single piece of the
"inconsistency" in the report.

**Fix:** it is a native control and its placeholder is not ours to style; set
the field's locale expectation explicitly, or replace the placeholder text with
a caption that states the format the page uses.

### F6 — The one genuinely untappable control

On `/products/[id]`, **"Remove image 1" is covered by "Move image 2 earlier"** —
confirmed by hit test after scrolling the button to the centre of the viewport,
so it is not a scroll artefact. The gallery's four per-tile icon buttons overlap
their neighbours at 390. This is the only control in the portal a thumb cannot
land on.

### F7 — The KPI grid leaves an orphan

On buyer detail, *Share of sales* renders as a **half-width tile with empty
space beside it**. Recorded as known on 2026-09-06 ("a KPI row mixing half
tiles with a full-width money tile leaves one empty cell") and still there.

**Fix:** below `sm`, a KPI row is one column or two, never a mix — whichever the
widest figure in the row demands.

### F8 — Two smaller inconsistencies, cheap to take while nearby

- The demand board's control labels (*Grain*, *Window*, *or up to*) are mono
  captions of different widths, so their controls start at three different x
  positions — a ragged left edge down the toolbar.
- On PO detail the identifier appears **twice in 90px** — once in the
  breadcrumb, once as the eyebrow directly beneath it.

---

## 4. What I would build, in order

1. **`PageHeader` wraps for real** (F1). One component, 11 pages.
2. **`DataTable` card mode becomes a summary card** (F2, F3) — omit `—` rows,
   whole card tappable, actions in a row at the card's foot rather than a lone
   centred icon.
3. **Filters behind a sheet below `md`** (F4), primary control left out.
4. **The gallery's icon buttons stop overlapping** (F6).
5. **KPI rows are one or two columns, never mixed** (F7).
6. **The date field states its format** (F5), and the toolbar's labels line up
   (F8).

1 and 4 are small and self-contained. 2 is the one with real design in it, and
the one that most changes how the portal feels on a phone.

---

## 5. Decisions I need before building

- **How much belongs on a card (F2).** My proposal is title + status + two
  facts. The alternative is to keep every field and accept the length, on the
  grounds that ops staff read the table to compare rows rather than to find
  one. This is the decision that shapes the phase.
- **Whether the filter sheet is worth it (F4)**, or whether a plain
  "Filters ▾" disclosure that expands in place is enough. The sheet is better
  on a phone and is more code.
- **Whether to keep the 44px floor as an absolute** (F3). Making the whole card
  the target is the right fix; if a card title must also stay a link for
  middle-click on desktop, the two need reconciling.

---

## 6. Acceptance criteria

Every one measured at **390 × 844** in a real browser, signed in, against the
seeded database, and re-measured at 768 and 1440 to prove nothing regressed.

1. No `h1` on any of the 11 `PageHeader` pages is narrower than **240px** or
   taller than **two lines**, with "Acme Industrial Sdn Bhd" on the buyer page
   as the test case.
2. `/purchase-orders` shows at least **3 records in the first screen** below
   its heading, against 1.4 today, and its total height drops by at least a
   third from 5,083px.
3. **Zero interactive elements under 44px** on the portal's ten routes, except
   the documented exceptions, which must be listed by name in the phase notes.
4. The hit test reports **zero covered controls** on all sixteen routes.
5. The demand board's first data row is visible **within the first screen**.
6. Horizontal overflow stays at **0 of 16 routes** at 390, 768 and 1440.
7. A card whose field is null prints **no row for it**, proven on a queued scan
   that has no PO number and no buyer.
8. Before and after screenshots of every changed screen, at 390, in the notes.

---

## 7. Not covered

- **The storefront.** `SHOP_HOST` is unset in this environment, so the shop
  lives at `/shop` on the portal host and answers a pinned 404 to a signed-in
  staff session — by design. The shop's own mobile state (its header, the
  category strip, `MobileCartBar`, the cart) was **not measured** and is not in
  this spec. It should get its own pass, or this one should be widened before
  it starts.
- **Tablet.** Everything above is 390. 768 was not walked; `DataTable` switches
  to a real table at `md`, so that width is the least tested of the three.
- **Real devices.** Chromium with a touch emulation profile is not an iPhone.
  Momentum scrolling, the URL bar's effect on `dvh`, and iOS Safari's handling
  of `position: fixed` with a software keyboard open are all unmeasured.
- **Landscape**, and any width between 390 and 768.
- **Anything on production.** Every figure above is the project's own seed on a
  local database.
