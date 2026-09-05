# Loving Hands Portal — Design Spec

Purchase-order intake portal. **Customers send purchase orders to Loving Hands**
(Loving Hands is the seller; a PO's total is revenue). Users sign in with Google,
upload a PO (PDF or image), the system extracts the structured data, the user
reviews and confirms, and the record lands in Neon with the original file kept
in R2. The dashboard then reads the confirmed POs as a sales trend.

This spec is written for Claude Design first (screens, states, mock data), then
for implementation. Visual language is the ClickUp design system in
`context/design-system.md` — every token referenced below is from
`src/app/globals.css`.

Status: **Design reference v12 — 2026-09-05** (screens and states only). v12 applies the design review: Upload left the sidebar, the dashboard leads with a compact KPI row and one trend, a totals mismatch locks Confirm, one status palette, sentence-case labels, truncation recovery, and KPIs that never render zero. Product-wide rules live in `../00-master.md` §4 (six-hue stage palette after two ramps proved too hard to read; per-field extraction confidence; Confirmed by in the PO list; every table sorts on every column; v10 Buyers tab with a triage roster at `/buyers`; document preview on PO detail and a file-type chip in the PO list; v9 buyer detail: order trend as a line chart, product order trend with product picker, what-they-buy donut; v8 PO lifecycle: six fulfillment stages with a stepper and advance action on PO detail, stage history, fulfillment trend + stage breakdown + open pipeline on the dashboard)

---

## 1. Product summary

| | |
|---|---|
| Name | Loving Hands Portal |
| Users | Internal ops staff (small team, one org) |
| Job | Get customer POs out of email attachments and into a queryable database, fast, without retyping — then see the sales trend |
| Buyer | The customer who issued the PO. Called "buyer" everywhere in UI and schema. |
| Auth | Google sign-in, or email + password for admin-created accounts |
| Currency | MYR only in v1 |
| File types | PDF, PNG, JPG only in v1 |
| Storage | Files → Cloudflare R2. Structured data → Neon (Postgres) via Prisma |
| Extraction | Claude API reads the file and returns a typed PO object; user confirms before save |

Core loop: **Upload → Extract → Review → Confirm → Browse.**

After Confirm a PO enters the **fulfillment lifecycle** — *Order placed →
In production → QC passed → In warehouse → Delivering → Delivered* — advanced
by hand from the PO detail page (§3.6). More stages may be added later; the
list is one ordered constant (§6).

---

## 2. Design principles for this product

Derived from the design system, applied to a data tool rather than a
marketing page:

1. **Calm chrome, dense data.** Canvas white, ink text, hairline borders. The
   data tables and the extraction review are the "tile grid" — they carry the
   visual weight, the chrome stays quiet.
2. **One dark pill per screen.** Exactly one `button-primary` (ink pill) per
   view — the action that moves the PO forward. Everything else is
   `button-secondary` or `button-tertiary`.
3. **Gradient is reserved.** `bg-brand-gradient` appears on the wordmark and
   the empty-state upload CTA only. Never on a table, never on a status badge.
4. **Status is semantic, not decorative.** One palette, the same everywhere —
   `brand-amber` needs review, `accent-green` confirmed or delivered,
   `accent-red` failed or overdue, `accent-blue` **only** for a process in
   flight (uploading, extracting, in production, delivering), `ink-secondary`
   with an amber ring for pending or invited, `ink-tertiary` for disabled. An
   overdue reorder is a risk, not a process, so it is red; a new buyer is a
   standing state, so it is neutral. No other use of accent hues, and colour
   never carries meaning without its label. Fulfillment
   **stages** get their own six-hue palette (§4) — the one place a set of
   distinct hues is used for something other than share-of-total, because six
   stages have to be told apart at a glance in a stacked bar.
5. **Eyebrows label sections.** Sometype Mono (`text-eyebrow`, `font-mono`,
   `text-ink-tertiary`) for section labels, field labels and table column
   headers — in **sentence case**, not caps. The mono family is what marks a
   label as chrome; the all-caps slowed scanning on screens read all day. This
   is a deliberate departure from the ClickUp system, noted in
   `context/design-system.md`. Nothing in the product is uppercase.
6. **Radius lanes.** Cards `rounded-lg` (14px). Inputs and secondary buttons
   `rounded-sm` (9px). Badges `rounded-xxs` (4px) or `rounded-full` for pills.
   Primary CTA `rounded-pill` (20px). Don't mix lanes in one row.
7. **Nothing shows a number it does not mean.** A KPI renders its real value on
   first paint — a count-up that starts at zero reads as a data bug, and was
   reported as one. A headline figure and the table under it come from the same
   query and the same window. Anything ellipsised carries its full value in a
   `title`, and a focused input shows its value whole.

---

## 3. Screens

Twelve artboards, desktop 1440 wide. Content column `max-w-[--container-page]`
(1160px). Every screen except Sign-in shares the App Shell.

### 3.0 App Shell (shared)

- **Left sidebar** — 240px, `bg-surface`, 1px `border-hairline` on the
  right, full viewport height, `p-lg` vertical / `p-md` horizontal.
  Top: wordmark "Loving Hands" with the "Zen" in `bg-brand-gradient` text clip.
  Below: nav rows *Dashboard · Purchase orders · Buyers · Products* — each 44px,
  `rounded-sm`, stroke icon + label at `text-body-sm` weight 500. Inactive
  `text-ink-secondary`; hover `bg-canvas text-ink`; active `bg-surface-soft
  text-ink` weight 600. All transitions on the system's
  `0.25s cubic-bezier(0.5, 0, 0.5, 1)`.
  There is no admin entry in the sidebar — `/admin` is reached by URL only.
  **The sidebar carries destinations, never actions.** Upload is not a nav row:
  it is the `button-primary` "Upload PO" in the page header of Dashboard,
  Purchase orders, Buyers and Buyer detail, and that button is the only way in.
  `/upload` and `/review/[id]` show *Purchase orders* as the active row, since
  intake belongs to that section.
  Bottom-left, pinned: user row — avatar (`rounded-full`, 32px, Google photo)
  with name at `text-body-sm` and email at `text-caption text-ink-tertiary`.
  Hover `bg-canvas`; click opens sign-out.
- **Content area** — everything right of the sidebar, `p-xl` (40px) with the
  content column at `max-w-[--container-page]` (1160px).
- **Page header** — eyebrow (`text-eyebrow font-mono text-ink-tertiary`, sentence case)
  above an `h1` at `text-display-md` (34px). Right-aligned action slot.
- **Hover states everywhere** — dark pill → `bg-ink-deep`; secondary button
  → `border-hairline-strong`; tertiary link → `text-primary`; table rows →
  `bg-surface`; chart bars → `bg-brand-link`.

### 3.1 Sign in — `/signin`

Centered card on `bg-surface` canvas.

- Card: `rounded-xxl` (35px), canvas bg, hairline border, `p-xxl` (60px),
  `shadow-md` (indigo-tinted), 480px wide.
- Wordmark large, then `h1` "Sign in to Loving Hands" at `text-display-lg`.
- Sub copy `text-body-md text-ink-secondary`: "Purchase-order intake for the
  ops team."
- **The card signposts two paths**, because a first-time visitor could not
  tell which control requests access. A quiet `text-eyebrow text-ink-tertiary`
  label **"Members"** sits above the email field, and **"New here?"** above the
  Google button. They are signposts, not headings — mono, small, tertiary.
- **Email + password form** (the *Members* path): two `text-input`s with mono
  labels; "Forgot password?" as a caption-sized tertiary link beside the
  password label. The dark pill "Sign in" (`button-primary`, full width) is the
  page's one primary.
- Hairline divider with "or" in `text-caption text-ink-tertiary`.
- **"Continue with Google"** (the *New here?* path) — `button-secondary`
  geometry at 48px, full width, canvas background, `border-hairline-strong`,
  Google "G" mark.
- Directly beneath that button, left-aligned with it, `text-caption
  text-ink-tertiary`: "Use Continue with Google to request access. An admin
  approves it." It belongs to the Google block, not to the card — placed at the
  foot of the card it read as applying to both paths, and it named a control
  ("Sign in with Google") that does not exist.
- **Error state** (password): an inline strip above the form,
  `bg-surface-soft`, `text-accent-red` — "Wrong email or password." Never say
  which of the two was wrong.

**Access requested — `/signin/pending`** (own artboard). What a Google
sign-in from an email that is not yet a user lands on. Same card: eyebrow
"Access requested", `h1` "You're on the list", copy "We've sent your request
to a Loving Hands admin. You'll get an email at the address below once it's
approved — usually within a working day." Then a `bg-surface` row with the
Google avatar, name, "daniel.tan@gmail.com · via Google" and a `brand-amber`
"Pending" badge. One `button-secondary` "Use a different account". No dark
pill — there is nothing for the user to do. Returning while still pending
shows the same screen; once approved the next Google sign-in goes straight
in; if declined, the next attempt shows "Your request was declined. Ask your
admin if you think that's a mistake."

**How Google sign-up gets approved** — the flow, end to end:

1. Any Google account can start a sign-in. Auth.js's `signIn` callback looks
   up the email. Existing active user → in. Disabled → error. **Unknown →**
   upsert an `AccessRequest` row (email, name, Google avatar, first/last
   seen), send the super admins an email "Daniel Tan is asking for access",
   and return the user to `/signin/pending`. No session is created.
2. A super admin opens `/admin`, sees the request in *Pending access
   requests*, picks a role, clicks **Approve** → a `User` row is created from
   the request with `status ACTIVE`, the request is marked approved, and the
   requester gets "You're in" with a sign-in link. **Decline** marks it
   declined (kept for audit, hidden from the list) and optionally emails.
3. Optional shortcut, off by default: `AUTO_APPROVE_DOMAIN=lovinghandsportal.com`
   approves Workspace-domain emails instantly as Members, so only outside
   Gmail addresses ever queue.

Both sign-in methods resolve to the same `User` by email. Password sign-in
uses Auth.js Credentials with bcrypt (cost 12); rate-limit 5 attempts / 15
min per email + IP. "Forgot password" emails a 30-minute single-use link.
There is no email/password self-sign-up — a password is something an admin
sets on an existing user.

### 3.2 Dashboard — `/`

Sales overview. Every number on the page is driven by one **date range** and one
**aggregation** setting; changing either redraws everything below the controls.

**Page order** — this is load-bearing. The review found analytics of equal
weight burying the state of the business, so the order is now:

1. **KPI row** — three compact tiles.
2. **One trend** — Fulfillment by default, Sales a click away in the same card.
3. **Status breakdown and stage bars** — the intake and stage split, directly
   under the trend. This is where the backlog is read: *Needs review*,
   *Extracting* and *Failed* are three of its four segments, each with its
   count.
4. **"More analytics"** — a collapsed disclosure holding market share, In this
   range, buyer churn and price drift.
5. **Purchase orders in range** — the table, last.

Nothing above the fold is a donut.

A dedicated "work queue" strip was drawn and then removed on 2026-09-05: it
repeated the three counts the Status breakdown bar already carries, and one
number in two places is a number that can disagree with itself. The backlog is
read from the status bar and worked from `/purchase-orders`, whose *Needs
review* chip carries its own count (§3.5).

**Header** — eyebrow "Overview", `h1` "Dashboard", right slot: `button-primary`
"Upload PO".

**Controls** — two rows directly under the header.

- Row 1, left: range chips (`badge-pill` geometry, 36px, active `bg-ink
  text-canvas`) — *Last day · Last 30 days · Last 60 days · Last 3 months ·
  Last year*. These are the primary control. Right: a `button-tertiary`
  **"Custom range"** which reveals the *From* and *To* date inputs
  (`text-input` at 40px, `rounded-sm`) beside it; the label becomes "Hide
  custom range" while open. The inputs are hidden by default and shown
  automatically when the current range is a custom one. Editing a date
  deselects every chip; clicking a chip rewrites both dates.
- Row 2, left: range summary `text-body-sm text-ink-secondary` — "5 Aug 2026 –
  3 Sep 2026 · 26 purchase orders". Right: *Aggregate* segmented control
  (`rounded-sm`, hairline, 36px) — *Daily · Weekly · Monthly · Quarterly ·
  Yearly*. Active segment `bg-surface-soft` weight 600.

Range state lives in the URL (`?from=&to=&agg=`) so a view can be shared, along
with the trend tab and the disclosure (`?trend=&more=`).

**KPI row** — 3 `card-tile`s (`rounded-md` 12px, hairline, `p-md`). All
computed over the selected range. There were four; "Awaiting review" was
dropped, because the Status breakdown bar below already reports the same count
alongside Extracting and Failed:

| Tile | Value | Caption |
|---|---|---|
| Total sales | **RM 1,242,928.00** — full figure, always 2 decimals, never abbreviated | `+12% vs. previous 30 days` in `text-accent-green` (red if negative; "No prior period to compare" in `text-ink-tertiary` when none) |
| Purchase orders | **26** | `text-ink-secondary` "RM 47,804.92 average" |
| Top buyer | **Acme Industrial Sdn Bhd** (at `text-heading-md`, ellipsised) | "RM 357,512.00 · 29% of sales" |

Value at `text-display-md font-display`; label above at `text-eyebrow`. The
Total sales tile is 1.6× the width of the others so the full figure fits on
one line at 34px. Money is always `RM 1,242,928.00` — the compact `RM 1.2M`
form is banned from KPIs; use it only inside chart tooltips if space forces it.

**Count-up.** KPI numbers and bar heights may animate from 0 to their value
over 900ms with an ease-out cubic — but the animation is never the initial
render state, and it never restarts. The first paint shows the real figure;
the animation, if any, runs client-side after mount, is skipped entirely under
`prefers-reduced-motion`, and does **not** re-run when the range, aggregation,
trend tab or any filter changes. A static capture of this page — a screenshot,
a print, a PDF export — must show real numbers.

This is not hypothetical. The canvas animated on mount from a zero state, and a
PDF export caught it at t=0: every KPI read "RM 0.00", "0 units sold",
"0.0% of revenue" beside tables showing RM 15.5M, and the review reported it as
a data bug. In the canvas the animation is now off entirely; in the build it is
a client-side enhancement over a server-rendered value.

**The trend card** — one card, two datasets. `card-section` (`bg-surface`,
`rounded-xl`, `p-xl`) carrying a `seg` control top-right, *Fulfillment ·
Sales*, with **Fulfillment the default** — this is an ops tool, and where the
orders stand is the more useful daily question. Only the selected chart
renders; the two are never on screen together. Both are specified below.

**Sales over time** — the *Sales* tab.
Eyebrow "Sales over time", `h2` `text-heading-md` "RM 1,242,928.00 across 30
days", caption "Daily totals · hover a point for the value". A **line chart**,
one point per aggregation bucket across the whole range (empty buckets stay
as zero points, never skipped, so the x-axis stays honest):

- 2px `ink` line with a 6% `ink` area fill beneath; points are 10px
  (6px past 60 buckets) with a 2px canvas ring; hover scales the point 1.5×
  and shows a tooltip "18 Aug — RM 47,950.00".
- **Max and min** points render in `primary` purple with a labelled chip
  ("Max RM 208,302.00" above, "Min RM 12,480.00" below, flipping above when
  near the axis). Min is taken over periods *with* sales, so an empty Sunday
  is never "the minimum". Chips are omitted when there is one bucket or when
  max = min.
- **Average** — a 2px dashed `brand-link` horizontal line at the mean of the
  buckets, labelled at its right end "Avg RM 41,430.93 per day" (the unit
  follows the aggregation). Recomputes with range and aggregation.
- Three recessive gridlines (0 / ½ / max) with `text-caption text-ink-tertiary`
  labels on the left; at most 12 x-axis labels; a legend row *Sales · Average
  per period · Max / min*.
- 8% headroom above the max so its chip never clips. Empty range: "No
  purchase orders in this range." centered.

**Fulfillment trend** — the *Fulfillment* tab, and the default view.
Eyebrow "Fulfillment trend", `h2` "9 of 24 confirmed orders still open",
caption "Where each period's orders stand today · hover a bar for the split".
A **stacked bar chart** on the same buckets as the line chart: one bar per
aggregation bucket (by PO date), segments = the *current* stage of the
confirmed POs in that bucket, *Delivered* at the bottom and *Order placed* on
top, using the §4 stage ramp. Y axis is PO **count** (throughput, not money);
three recessive gridlines (0 / ½ / max) with integer labels. 2px gaps between
segments and between bars (1px past 60 buckets); only the top segment of a
bar gets a 3px top radius. Empty buckets stay as empty columns. Hover a bar
→ tooltip "18 Aug — 4 confirmed · In production: 2 · Delivered: 2". Legend
row below lists all six stages in order. Unconfirmed POs (needs review,
extracting, failed) are not on this chart — they are on Status breakdown.
Empty state: "No confirmed purchase orders in this range."

**Status breakdown** — full-width `card-feature`, two bars separated by a
hairline. It sits **directly under the trend card and above the "More
analytics" disclosure**, not with the analytics: three of its four intake
segments — Needs review, Extracting, Failed — are the backlog, so this is the
one place on the dashboard that reports work outstanding. *Intake* (eyebrow "Status breakdown · intake", caption "26 purchase
orders"): one 14px stacked bar with 2px gaps, segments in fixed order
*Confirmed · Needs review · Extracting · Failed* using the §4 status colors
(the only place a status color is used as a fill — it is the legend swatch,
and a label sits beside every segment). *Stage* (eyebrow "Stage · confirmed
orders", caption "24 confirmed"): the same bar geometry over confirmed POs
only, six segments in stage order using the §4 stage ramp — the funnel view
of the range. Each bar has a legend row below: 10px swatch, label, count
(the stage legend always lists all six, even at 0).

**"More analytics"** — everything below this point, up to the purchase-order
table, sits behind one disclosure: a centred `button-secondary` reading "More analytics" on a hairline
rule, **collapsed by default**, opening to reveal market share, In this range,
buyer churn and product price drift. They answer "how are we doing", which is a
question you go looking for; the status bars above answer "what is
outstanding", which has to be in front of you. The label becomes "Hide analytics" when open.

**Market share by buyer · Market share by product** — two `card-feature`s
side by side, each a 168px **donut** (CSS `conic-gradient`, 26px ring) with
the leader's share in the middle ("29% · top buyer") and a legend to the
right: swatch, name (ellipsised), share %, value. Top 5 slices in the fixed
categorical order below, everything else folded into "Other (n)" in
`ink-disabled` gray. Product share aggregates line-item value across every
PO in range. Both share the same range as the rest of the page.

**Categorical palette** (validated with the `dataviz` validator, light mode,
all checks pass; the orange's 2.95:1 contrast is covered by the legend
labels): `#7612fa` primary · `#0091ff` accent-blue · `#f76808` brand-orange ·
`#a43cb4` accent-magenta · `#078d3b` accent-green · `#7b68ee` brand-link ·
Other `#b4b4b4`. Assigned in that order by rank, never cycled, never reused
for status.

**In this range** — six smaller `card-tile`s in a 3 × 2 grid, values at
`text-heading-md`, all count-up:

| Tile | Value | Caption |
|---|---|---|
| Largest PO | **RM 132,516.00** | "PO-KELA-2387 · Kelana Steel" (links to the PO) |
| New buyers | **2** | "9 returning" — new = first-ever PO falls inside the range |
| Top-3 concentration | **61%** | `brand-amber` "Concentrated — revenue depends on 3 buyers" above 60%, else `accent-green` "Healthy spread across buyers" |
| Items per PO | **4.0** | "2,113 units in total" |
| Extraction failures | **3.8%** | "1 of 26 uploads needed a retry" |
| Open pipeline | **9** | "RM 212,400.00 still to deliver · 14 days avg order → delivered" — confirmed POs in range whose stage is not *Delivered*; the average is over POs delivered in range (first `ORDER_PLACED` event → `DELIVERED` event) |

**Buyer churn · Product price drift** — two `card-feature`s side by side,
both on the page's range and its *previous period* (same length, ending the
day before `from`).

*Buyer churn* — headline "27%" at `text-heading-md` with "3 lapsed of 11
active last period · 0 at risk"; a caption on the right states the
definition in one line. Then up to six rows — buyer name (links to the buyer
page), "Last order 29 Jul 2026 · 36 days silent", the value they spent last
period, and a badge. Definitions:

| Term | Rule |
|---|---|
| **Lapsed** (`accent-red`) | ≥ 1 PO in the previous period and 0 in the current range. Churn rate = lapsed ÷ buyers active in the previous period. |
| **At risk** (`brand-amber`) | ≥ 1 PO in the current range, but days since their last order > 2 × their own mean gap between orders, and ≥ 14 days. Cadence-aware, so a weekly buyer trips after ~2 weeks and a quarterly one doesn't. |
| **Churned** (spec only, not a range stat) | No order for 90+ days and > 3 × cadence. Excluded from *At risk* so dead accounts don't crowd the list; surfaces on a future `/buyers` list as a filter. |

Empty state: "No lapsed or at-risk buyers in this range."

*Product price drift* — headline "5 up · 0 down" with "of 12 products sold
in both periods". Per product: mean **billed** unit price (line amount ÷
quantity, so discounts count) in the current range vs. the previous period.
Six rows sorted by |Δ|: name, "RM 503.72 → RM 514.82 per unit", a small
diverging bar centred at zero, and the % in `accent-green` (up) or
`accent-red` (down). Empty state when a product wasn't sold in both periods.
The Products page carries the 12-month version of the same number.


**Purchase orders in range** — eyebrow "Purchase orders in range", "View all
→" as `button-tertiary` top-right, then the §4 table filtered to the range,
paginated (§4). No filter row here — filtering lives on `/purchase-orders`.

**Chart rules** — one axis per chart, never dual-axis. The line chart is
single-hue (`ink`) with `primary` reserved for the two extremes and
`brand-link` for the average. The stacked bars use the six-hue stage palette
(§4), which is deliberately a different set from the donut palette above so
the two cards are not read as one scale. The donuts are the only categorical
color on the page. Text never wears a series color. Load the `dataviz` skill before
touching any of these charts.

**Candidate statistics not yet built** (each is one query on the same
tables): month-over-month growth per buyer; review turnaround (upload →
confirm, needs timestamps on `Extraction`); average days from PO date to
upload (how late POs reach us); year-over-year for the same range; a
30/60/90-day forecast from the trailing average. Buyer churn and product
price drift are built (above).

**Empty state** (no POs yet): replace KPI row and table with one
`card-feature-panel` (`rounded-xxl`, `p-xl`) — centered eyebrow "Get started",
`h2` `text-display-md` "Upload your first purchase order", short copy, and the
*only* gradient button in the app: `button-gradient` "Upload a PO".

### 3.3 Upload — `/upload`

**Header** — eyebrow "Intake", `h1` "Upload purchase orders".

**Dropzone** — `card-feature-panel` geometry (`rounded-xxl`, hairline) at
`min-h-[320px]`, dashed `border-hairline-strong`. Center: upload icon inside an
`app-icon-chip` (40px circle, `bg-surface`), `h3` `text-heading-md` "Drop PO
files here", `text-body-md text-ink-secondary` "PDF, PNG, JPG — up to 20 MB
each", then `button-secondary` "Browse files".

Drag-over state: border becomes 2px `border-primary`, background `bg-surface`.

**Queue** — below the dropzone, one row per file inside a `card-feature`:

```
[file icon]  PO-ACME-2026-0917.pdf     1.2 MB    [status badge]   [×]
             ───────────────── progress bar ───────────
```

**Every progress bar is the same bar.** 4px tall, full-width `surface-soft`
track, `rounded-full`. Only the fill colour and the row's status label
distinguish the states — a lighter or thinner bar for one state reads as a
different kind of progress.

Status badge = `badge-pill` variants:
- *Uploading* — `text-accent-blue`, bar fills `bg-ink`, percentage at the right
- *Extracting* — `text-accent-blue`, indeterminate shimmer on the same bar,
  fill `bg-accent-blue`
- *Ready to review* — `text-brand-amber`, row gains a `button-tertiary`
  "Review →"
- *Confirmed* — `text-accent-green`
- *Failed* — `text-accent-red`, `button-tertiary` "Retry", **and a one-line
  reason** under the filename in `text-caption text-ink-tertiary` — "Couldn't
  read the PDF — it may be a scan with no text layer", "File too large — 24.1 MB,
  limit is 20 MB". A failure with no explanation gives the user nothing to do.

Filenames ellipsise and carry a `title` with the full name.

Primary action for the page: none while the queue is empty; once any file
reaches *Ready to review*, a sticky footer bar (canvas, hairline top) shows
`button-primary` "Review N files" on the right. **N counts only rows in *Ready
to review*** — never failed, never uploading, never extracting — and a caption
beside it names what is being left behind: "Not included: 1 still uploading ·
1 failed". At N = 0 the pill renders disabled (`bg-surface-soft
text-ink-disabled`). A button that offers to review a file which cannot be
reviewed is a broken promise.

### 3.4 Extraction review — `/review/[id]`

The most important screen. Side-by-side: source on the left, extracted data on
the right. This is where a person catches OCR mistakes before anything is
saved.

**Header** — eyebrow "Review 1 of 3", `h1` = filename. Right slot:
`button-secondary` "Discard", then `button-primary` "Confirm & save" — which is
**disabled whenever the totals disagree with the document** (see below), with
`text-caption text-accent-red` "Locked — totals don't match" beneath it.

**Layout** — two columns, `gap-lg`, left 55% / right 45%, both
`card-feature` (`rounded-lg`), height fills viewport below header, each scrolls
independently.

**Left — Source** — eyebrow "Source file". Rendered PDF page (or image) with
page controls `text-caption` at the bottom. Open in new tab as
`button-tertiary`.

**Right — Extracted data** — eyebrow "Extracted fields", with the caption
"under 90% is worth a look" and an overall confidence `badge-pill` beside it
("92% overall", `text-accent-green` ≥ 85, `text-brand-amber` 60–84,
`text-accent-red` < 60).

Fields as a 2-column form, each `text-input` (44px, `rounded-sm`,
`border-hairline-strong`, focus 2px `border-primary`). **Buyer leads, spanning
both columns**, so the longest value on the form is never the one that gets
cut — a buyer name truncated to "Acme In…" inside the field a reviewer is
checking is the one truncation the screen cannot afford. Only one field carries
focus, and a focused field shows its value in full rather than clipped.

| Field | Type | Notes |
|---|---|---|
| Buyer | text + suggestion, **full width** | matches existing buyer → shows `badge-pill` "Known buyer" |
| PO number | text | required |
| PO date | date | |
| Delivery date | date | optional |
| Currency | select | MYR default |
| Buyer reference | text | optional |
| Payment terms | text | optional |

**Every field shows its own confidence.** The label row is a flex row: the
`text-eyebrow` label on the left, the model's confidence for that field on
the right as `text-caption` tabular figures at weight 500. One number per
field, no meters or bars — twelve tiny gauges would be noise, and the number
is what a reviewer acts on.

| Confidence | Treatment |
|---|---|
| ≥ 90 | `text-ink-tertiary` — quiet, nothing to check |
| 70–89 | `text-brand-amber` on the number only |
| < 70 | `text-brand-amber` number, plus a 2px `border-brand-amber` left border on the input and a `text-caption text-brand-amber` hint "Low confidence — check source" |

Most fields sit in the quiet band, so the eye lands on the two or three that
do not. The per-field numbers come from the confidence map
`Extraction.rawJson` already carries (§6), so nothing new is stored.

**Line items** — eyebrow "Line items", editable table: Description · Qty ·
Unit · Unit price · Amount. Add-row link as `button-tertiary` "+ Add line".
Footer row: Subtotal, Tax, **Total** (`text-heading-sm font-display`).

**The totals gate.** Compare the **computed total** (subtotal + tax) with the
total printed on the document. Comparing the line-item sum to the document
total, as an earlier draft did, is wrong — it ignores tax and reports a
difference that isn't one.

When they disagree, three things happen together:

1. **A banner above the two-column split**, not merely a caption by the totals.
   `card` geometry with a 3px `border-accent-red` left edge, `shadow-xs`, an
   alert glyph, and:
   - `text-heading-sm` "The totals don't match the document", with
     `text-caption text-ink-tertiary` "Confirm & save is locked until this is
     resolved" beside it.
   - Three labelled figures in a row — *Computed total*, *Document says*,
     *Difference* — at `text-body-lg` weight 600, tabular figures, the
     difference in `text-accent-red`.
   - A line of `text-body-sm text-ink-secondary` guidance naming the likely
     cause: "Subtotal RM 19,830.00 plus SST 8% comes to RM 21,416.40. A line the
     extraction missed, or a different tax rate, is the usual cause — check the
     source on the left. Fix the line items or the total and Confirm unlocks by
     itself."
   - Below a hairline, the acknowledgement: a checkbox, "I checked the source —
     save with this mismatch", and `text-caption text-ink-tertiary` "Unlocks
     Confirm and records the difference in this PO's activity log, with your
     name."
2. **The Total row turns `text-accent-red`**, and the caption beneath it points
   at the banner: "RM 3,263.60 under the document's RM 24,680.00 — see the
   banner above." The eye needs to land where the problem is.
3. **Confirm & save is disabled.**

There are exactly two ways out. **Fix the numbers** — edit the lines or the
totals until they agree, and Confirm unlocks on its own; this is the path the
screen pushes. Or **acknowledge** — tick the box, which unlocks Confirm and
writes an activity entry naming the difference, so a PO saved with a mismatch
is always traceable to the person who decided it was right. The escape hatch
exists because a printed total genuinely can differ from the lines (freight, a
handwritten discount, a rounding convention), and a reviewer who can see the
paper is better placed to judge than the rule is.

**Low confidence never blocks.** A field under 70% gets its amber number,
amber left border and "Low confidence — check source" hint, and nothing more.
Confidence is a warning about a value; the totals gate is an arithmetic
contradiction. Only the second one is a fact.

**Notes** — single textarea, optional.

**States**
- *Extracting* (arrived before extraction finished): right column shows
  skeleton rows in `bg-surface-soft`, eyebrow "Extracting…" with a
  `text-accent-blue` dot. Primary button disabled.
- *Extraction failed*: right column shows an empty form with a
  `bg-surface-soft` strip at top: `text-accent-red` "We couldn't read this
  file. Fill the fields manually or try again." + `button-secondary`
  "Retry extraction".
- *Confirmed*: after save, a toast (bottom-right, `bg-ink text-canvas`,
  `rounded-md`, `shadow-sm`) "PO-2026-0917 saved" with "View →" link; page
  advances to the next file in the queue or returns to `/purchase-orders`.

### 3.5 Purchase orders — `/purchase-orders`

Every uploaded purchase order lives here, and this is the only place a PO
record is opened from. Buyer-level questions belong to the Buyers tab (§3.8).

**Header** — eyebrow "Records", `h1` "Purchase orders", right slot:
`button-primary` "Upload PO".

**Filter row** — one row, wraps on narrow widths:

- Search `text-input` (300px, search icon inset) — matches PO number **or any
  line-item description** inside the PO. Debounced 200ms.
- *Buyer* select — "All buyers" + every known buyer.
- *Uploaded by* select — "Uploaded by anyone" + every user.
- *Stage* select — "Any stage" + the six stages in order + "Not delivered".
  Only meaningful with *All* or *Confirmed* selected; other status chips
  disable it.
- Status chips, right-aligned — *All · Confirmed · Needs review · Extracting ·
  Failed*, active `bg-ink text-canvas`. Each carries a 6px dot in its §4 status
  colour, so the chips and the table's badges read as one system. **The "Needs
  review" chip shows its count when it is greater than zero** ("Needs review 4"),
  computed from the same query the table runs with the other filters applied and
  the status filter removed — never hard-coded. A zero count shows no number.
  The backlog is the reason to open this page; it should be legible from the
  filter row.
- Below the row: result summary `text-body-sm text-ink-secondary` — "48
  purchase orders · RM 1,212,370.00" — and, only when any filter is active, a
  `button-tertiary` "✕ Clear filters".

Every filter change resets to page 1. Filter state lives in the URL
(`?q=&buyer=&by=&status=&stage=&page=&size=`).

**Table** — full-width `card-feature`, columns:

PO number · Buyer · PO date · Items · Total · Status · Uploaded by ·
Confirmed by · ›

The PO number cell carries a small `rounded-xxs` `surface-soft` chip with
the uploaded file's type (PDF / JPG / PNG) in `font-mono` 10px before the
number, so what was uploaded is visible without opening the row.

Row hover `bg-surface`. Row click → detail. Status column uses the §4 badge:
intake status until the PO is confirmed, then its **stage** ("In production",
"Delivered"). "Uploaded by" and "Confirmed by" each show the 24px avatar plus the name. A
PO nobody has confirmed yet reads "Not confirmed" in `text-ink-disabled`, so
the backlog is visible from the list and sortable to the top. Paginated per §4.

**Empty (filtered)**: centered `text-body-sm text-ink-secondary` "No purchase
orders match." inside the card — no illustration.

### 3.6 PO detail — `/purchase-orders/[id]`

**Breadcrumb** — above the header, "‹ Purchase orders / PO-SP-0906": the first
part a `text-brand-link` link back to the list, the separator and the PO number
in `text-ink-tertiary`. Matches the Product detail breadcrumb. A detail page
reached from four different places needs a visible way back.

**Header** — eyebrow "PO-ACME-2026-0917", `h1` = buyer name, `badge-pill`
inline after the title showing the intake status until confirmed, then the
current stage. Right slot: `button-secondary` "Download original",
`button-secondary` "Edit". The page's one dark pill lives in the Lifecycle
card below.

**Lifecycle** — full-width `card-feature` directly under the header. This is
the reason to open a confirmed PO.

- Left: eyebrow "Lifecycle", `text-heading-sm` "In production · stage 2 of
  6", caption "Moved here by Chris Lam on 2 Sep 2026 · 1 day in this stage ·
  “Batch 1 started, gravel first”" (the note, if any).
- Right: `button-primary` **"Advance to QC passed"** — the label always names
  the *next* stage. Click opens a popover (`card-tile`, `shadow-md`) with an
  optional note `textarea` (2 rows, placeholder "Add a note for the
  timeline") and `button-primary` "Confirm". On success: stepper animates one
  step, toast "Moved to QC passed". At *Delivered* the button disappears and
  the heading reads "Delivered · 18 days from order".
- **Move back** — a `button-secondary`, not a text link, sitting immediately to
  the left of the Advance pill; super admins only, with `text-caption
  text-ink-tertiary` under the pair: "Move back is super admin only · asks for
  confirmation and a note". It rewrites history, so it needs the weight of a
  button and the friction of a confirmation: a dialog headed "Move back to
  {previous stage}?", one line saying the move is recorded in the timeline with
  their name, a **required** note (`text-input`, 2 rows) under the label "Why
  are you moving it back?", the caption "A note is required when moving back",
  then Cancel (`button-secondary`) and a confirm rendered as the ink 9px button
  used for drawer saves — never a second dark pill on the page.
- Below: the **stage stepper** (§4) — six nodes on one hairline track, equal
  columns. Completed nodes are ink-filled with a white check and show
  "1 Sep · Aisha Rahman" beneath the label; the current node is an ink ring
  with an ink dot and a 600-weight label; upcoming nodes are hollow
  `border-hairline-strong` circles with `text-ink-tertiary` labels and no
  caption. The track is filled in ink up to the current node.
- **The current stage breathes.** A 2.8s loop on the system easing
  (`cubic-bezier(0.5, 0, 0.5, 1)`), so the one stage the order is actually
  sitting in reads as live: a 2px ink ring expands out of the current node
  from `scale(1)` at 50% opacity to `scale(1.65)` at 0, its inner dot swells
  to `scale(1.18)` and back, and the filled length of the track dips to 72%
  opacity on the same beat. Nothing changes position and the filled length
  never changes, so the animation cannot misreport progress. Under
  `prefers-reduced-motion` all three stop and the ring rests at 28% opacity.
- Not yet confirmed (`stage` null): the stepper renders fully muted, no
  button, caption "Lifecycle starts when this PO is confirmed."

**Layout** — below Lifecycle, a two-column split, 45/55, read-only. **Left:
the original document** — a `card` on `surface-soft` with eyebrow "Original
document", a `button-tertiary` "Open original ↗", the page facsimile (white
page, `shadow-md`, 1/1.3 aspect) exactly as §3.4 renders it, and a
"‹ Page 1 of 2 ›" pager beneath. Seeing the paper beside the parsed data is
what makes a stored PO checkable. **Right:** the Summary card (fields as a
definition list, label `text-eyebrow text-ink-tertiary`, value
`text-body-md`) stacked above the Line items card with its totals. Below both, full-width `card-tile` "Activity": uploaded · extracted ·
confirmed · every stage event ("Moved to In production — “Batch 1 started,
gravel first”", by whom; the automatic first one reads "Order placed —
lifecycle started" by System), newest first, timestamps in `text-caption`.

---

### 3.7 Admin — `/admin`

Super-admin user management. **Not linked from anywhere** — super admins
type the URL. Anyone else (member, signed-out) gets a 404, never a
"forbidden" page, so the route's existence isn't advertised.

**Shell** — deliberately not the portal sidebar, so it reads as a separate
place: a 60px top bar with the wordmark, a hairline divider and an "ADMIN"
mono label on the left; "‹ Back to portal" (`button-tertiary`) and the avatar
on the right. Content column 1160px; when the drawer is open the column
narrows to 920px so nothing is covered.

**Header** — eyebrow "Admin · /admin", `h1` "User management", right slot:
`button-primary` "+ New user".

**Pending access requests** — first thing on the page, above the users
table; hidden entirely when there are none. Eyebrow with an amber count
badge, caption "People who signed in with Google but aren't on the list yet".
A `card-feature` with a `brand-amber` border, one row per request: Google
avatar, name, "daniel.tan@gmail.com · signed in with Google · 12 min ago", a
role select defaulting to *Member*, **Decline** (`button-secondary`) and
**Approve** (ink, `rounded-sm`). Approving removes the row with a toast
"Daniel Tan can sign in now".

**Users** — eyebrow "Users · 5" with search and status chips (*All · Active ·
Invited · Disabled*) right-aligned. Table, paginated per §4:

User (avatar, name, email stacked) · Role (`badge-pill`; Super admin in
`text-brand-link`) · Status (Active `accent-green`; **Invited** `ink-secondary`
text with a 1px `brand-amber` ring and an amber dot — deliberately distinct from
the amber *text* that means "needs review" elsewhere; Disabled `ink-tertiary`) ·
Last active · "Edit" and "Reset password" as `button-tertiary`.

**A user with no password has nothing to reset.** Everyone can sign in with
Google; a password is an optional extra an admin sets. On rows where
`passwordHash` is null, "Reset password" is replaced by the non-interactive
caption "Password managed by Google" in `text-ink-tertiary`, with a `title`
reading "This user has no password. They sign in with Google." Rows that do
have one keep the action.

Sign-in method is not a column and not a field: every user can sign in with
Google on their email, and a password is an optional extra an admin sets.

**Edit / New user drawer** — 440px, slides in from the right below the top
bar, `shadow-md`, hairline left edge. Fields:

- Full name; Email with the caption "Google sign-in matches on this address."
- Role — segmented *Member / Super admin*, caption "Super admins can open
  /admin and manage users. Members can upload, review and browse."
- *Set a password* block (`bg-surface`, `rounded-md`): password input, a
  checked-by-default "Require a new password at next sign-in", caption
  "Optional — anyone can also sign in with Google. Leave blank to keep the
  current password. Changing it signs the user out everywhere."
- Account active toggle (`accent-green` on) — disabled users keep their
  history but cannot sign in.
- Footer: "Delete user" (`button-tertiary`, `text-accent-red`) left; Cancel
  and Save changes (ink, `rounded-sm`) right. The drawer's Save is modal, so
  it is the exception to one-dark-pill-per-screen.

Rules: a super admin cannot delete or demote themselves; the last super
admin cannot be demoted; **deleting a user is typed-confirmation only**: a dialog headed "Delete Priya
Kumar?", body copy saying their uploads and stage history stay in Loving Hands
attributed to a deleted user and that they lose access immediately, then the
label "Type their email to confirm" over a `text-input` and the caption "Must
match priya@lovinghandsportal.com exactly." The Delete button renders disabled
(`bg-surface-soft text-ink-disabled`) until the string matches, with the caption
"Delete unlocks when the email matches." The dialog is `card` geometry at
440–520px; `accent-red` appears in the title only, never as a fill. New user with a password shows the
temporary password once in a copyable field; without one it just creates the
row and says "They can sign in with Google now."

### 3.8 Buyers — `/buyers`

The Buyers tab's landing page: a roster you sort and scan, not another chart
page. The dashboard answers "how are sales doing" and buyer detail answers
"how is this one customer doing"; this answers **"which customers need me
today"**. Working prototype on the seed data.

**Header** — eyebrow "Directory", `h1` "Buyers", right slot: `button-primary`
"Upload PO".

**Controls** — range chips (*Last 3 months · 6 months · Last year · All
time*) and a summary line "4 Sep 2025 – 3 Sep 2026 · 11 buyers · RM
15,503,201.31 in range". One range drives the whole page. State in the URL
(`?range=&filter=&q=&sort=&dir=&page=&size=`).

**KPI row** — four `card-tile`s, count-up, all over the range:

| Tile | Value | Caption |
|---|---|---|
| Buyers with orders | **11** | "of 11 on record" |
| New buyers | **2** | "first order inside this range", or "Range reaches the start of the record" when it cannot be told (below) |
| At risk or lapsed | **3** | `brand-amber` "0 lapsed · 3 at risk" |
| Revenue per buyer | **RM 1,409,381.94** | "average per buyer with orders" |

**Needs attention** — full-width `card-feature`, eyebrow "Needs attention",
caption "Click a number to filter the table below". Three equal columns
divided by hairlines, each a button: a `text-heading-md` count, a label, and
a one-line definition. Clicking sets the table filter **and** marks the column selected —
`bg-surface-soft` plus a 1px `hairline-strong` inset ring — while the table's
result summary names the filter that is on ("3 buyers · at risk") beside the
`button-tertiary` "Clear filter". Clicking the active column clears it. The
three counts and the table filter are one control, not two that happen to
agree. A count of zero
renders `ink-disabled` rather than in its status color, so an empty category
does not shout.

| Column | Count | Definition |
|---|---|---|
| Lapsed (`accent-red`) | buyers | "bought last period, nothing since" |
| At risk (`brand-amber`) | buyers | "silent past twice their usual gap" |
| Overdue reorders (`accent-red`) | buyers | "58 items past their usual interval" |

**Table** — a search `text-input` (300px) above left, the result summary
above right with a `button-tertiary` "Clear filter" when any filter is on.
Columns, every one sortable by clicking its header (the active header goes
`text-ink` with a ↑/↓ caret; first click is descending except on Buyer):

Buyer · Orders · Total · Overdue · Avg PO · Last order · Cadence · Trend ·
Status · ›

*Trend* is a 60×24 sparkline of that buyer's monthly totals across the range,
2px `ink` line scaled to its own maximum, `ink-disabled` for a lapsed buyer.
*Overdue* is their count of items past the usual interval, `brand-amber`
above 2. Row click → buyer detail. Paginated per §4. Buyer names are
`nowrap` and ellipsised; money columns never wrap.

**Status** (one badge per row, first match wins) — the same definitions the
dashboard uses for churn, so the two screens always agree:

| Badge | Rule |
|---|---|
| Lapsed (`accent-red`) | ≥ 1 PO in the previous period, none in this range |
| At risk (`brand-amber`) | ordered in range, but silent ≥ 14 days and past 2× their own mean gap |
| New (`ink-secondary`) | first-ever PO inside the range — **only** when the record starts at least a quarter of the range before it. Without that history "new" cannot be told from "we have no earlier data", so the label is suppressed and the KPI caption says so. |
| Active (`accent-green`) | everything else |

"New" is neutral, not blue: blue means a process in flight, and a new buyer is
a standing fact. Nor does a new buyer need chasing — on a roster whose job is
"who needs me today", only the three statuses above it should carry a colour.

The *Overdue* column follows the same rule as the attention count: any value of
1 or more is `accent-red`, and zero renders as an em dash in `ink-secondary`.
There is no amber "approaching" tier, because the underlying number only counts
items that are already past their interval — an amber step would imply a
distinction the data does not make.

Cadence and overdue reorders are computed from each buyer's **full** history,
not the range, because both are predictions about their rhythm.

**Empty (filtered)**: centered `text-body-sm text-ink-secondary` "No buyers
match." inside the card.

### 3.9 Buyer detail — `/buyers/[id]`

Reached from the Buyers roster (§3.8), or by clicking a buyer name anywhere
else it appears (tables, PO detail, Top buyers chart). Buyer names render in `text-ink` and turn `text-brand-link`
underlined on hover. Working prototype on the seed data.

**Header** — eyebrow "Buyer", `h1` = buyer name, inline `badge-pill` "#1
buyer all time". Right slot: `button-secondary` "Edit details",
`button-primary` "Upload PO" (pre-filled to this buyer).

**Controls** — directly under the header, as on the dashboard: range chips
left (*Last 3 months · 6 months · Last year · All time*), *Aggregate*
segmented control right (*Weekly · Monthly · Quarterly · Yearly*), then a
summary line "5 Sep 2025 – 4 Sep 2026 · 58 purchase orders · every number on
this page follows this range". **One range drives the whole page** — KPIs,
both trend charts, What they buy, Status breakdown and the PO table. The
single exception is *Reorder signals*, which predicts from the buyer's full
history and says so in its caption. State lives in the URL
(`?range=&agg=`).

**KPI row** — five `card-tile`s (first 1.7× wide), values at
`text-heading-md`, all count-up, all over the selected range:

| Tile | Value | Caption |
|---|---|---|
| Purchases | **RM 1,241,300.00** | "24 purchase orders in range · buyer since 4 Sep 2025" |
| Share of sales | **21.2%** | "of all buyers in range" |
| Average PO | **RM 62,966.69** | "4.1 items per order" |
| Order cadence | **6** | "days between orders in range" (mean gap) |
| Last order | **3d ago** | `accent-green` "On their usual rhythm", or `brand-amber` "Quieter than usual — worth a call" when the gap exceeds 1.5× their cadence |

**Order trend** — `card-section`. A **line chart** built exactly like §3.2 Sales over
time: 2px `ink` line, 6% area fill, one point per bucket, `primary` max and
min chips (min over periods with orders), dashed `brand-link` average line
with its label, three gridlines, legend. Title "RM 1,241,300.00 across 13
months", caption "24 purchase orders · hover a point for the value".

**Product order trend** — `card-section` directly under Order trend, on the
same buckets. Eyebrow "Product order trend", `h2` "3 of 12 products",
caption "Units per month · pick up to 6 products". Right slot: a **product
dropdown** — a `text-input`-styled trigger (40px, `rounded-sm`, chevron)
reading "3 products selected" (or the single name, or "Choose products"),
opening a `card` panel (360px, `shadow-md`) with a caption "Products bought
in range · pick up to 6" and one checkbox row per product this buyer bought
in range, sorted by spend: 16px `rounded-xxs` box (checked = filled with the
line's color and a white check), name, spend in range as `text-caption`.
Rows stay checked across range changes; with 6 checked the rest go
`text-ink-disabled` and a click on them turns the card caption `brand-amber`
"Up to 6 products at a time — deselect one first". Click outside closes.
Default: the top 3 by spend in range. Y axis is **units** (quantity, summed over line items per bucket —
never money, so products of different price stay comparable). One 2px line
per product with 8px points and a 2px canvas ring, colors assigned in the
§3.2 categorical order by the chip's rank *at selection time* and kept while
selected (a deselect never repaints the others). Hover a point → "Aug 26 ·
Granite stepping stone · 120 units · RM 5,040.00". Legend row below: swatch,
name. Empty buckets are zero points. No max/min chips here — with several
series they would collide; the tooltip carries the value.

**What they buy** — full-width `card-feature`, over the selected range. Left
slot of the header: eyebrow "What they buy" with a caption naming the
measure. Right slot: a small segmented control *Value (RM) · Quantity*
choosing between share of spend and share of units bought.

The body is two columns. Left, a 168px **donut** (CSS `conic-gradient`, 26px
ring, §3.2 construction): top 5 products in the categorical order, the rest
folded into "Other (n)" in `ink-disabled`, leader's share in the centre
("53% · top product by value"). Right, filling the remaining width, a
**horizontal bar chart** of the same rows — the donut gives share of the
whole, the bars rank the products against each other. Each row is two lines
so nothing collides at any name length:

1. 10px swatch in the slice color, then the product name at `text-body-sm`,
   ellipsised if it still overruns.
2. A 14px `rounded-xxs` bar on a `surface-soft` track, filled in the slice
   color to its share of the **largest** row, then the value in the chosen
   measure right-aligned in a fixed 150px column, then the share % in
   `text-caption text-ink-tertiary` — "RM 1,879,120.00 · 51.9%" or
   "663 units · 10.8%".

Switching the measure re-animates the ring and the bars together and swaps
every value. Bars are widths of the largest row, not of the total, so the
smaller slices stay readable.

**Two cards in a row:**

- *Reorder signals* — the useful one. For every item this buyer has bought
  ≥ 4 times, compute their mean interval between purchases; due date = last
  purchase + interval. List the five most pressing: item name, caption
  "Every ~34 days · last 12 Aug 2026 · 7×", and a badge — `accent-red`
  "Overdue 12d" (> 7 days past due), `brand-amber` "Due now" (±7 days),
  `accent-green` "Due 21 Sep 2026". Derived only from the buyer's own history,
  so it needs no configuration. This is the sales nudge: the ops team sees
  what to follow up on before the customer chases. The card header carries a
  `button-tertiary` **"Upload PO"** with the caption "Opens the upload screen
  with this buyer preselected" — the signal is only useful if acting on it is
  one click away, and the label has to name what actually happens: Loving Hands is
  the seller, so nothing here is being bought.
- *Details* — contact, email, phone, delivery address, payment terms, "buyer
  since". Fields that have values show them. Fields that do not are **not**
  rendered as empty labelled rows — a hi-fi mockup full of blank shells reads
  as broken. When contact details are missing, the card shows one line of
  `text-caption text-ink-tertiary` "No contact details yet" and a
  `button-tertiary` "Add contact details"; payment terms and "buyer since",
  which are always known, keep their rows.

**Status breakdown** — as §3.2 intake bar, for the selected range.

**Purchase orders** — this buyer's POs in range, status chips
(*All · Confirmed · Needs review · Failed*), an *Items* column listing "12×
Granite stepping stone, 3× Stone lantern…" ellipsised, paginated per §4.

Not built yet, worth considering: a small "vs. last period" delta on
All-time purchases; a CSV export of this buyer's POs; and, once there are
several buyers' pages, a `/buyers` list to navigate between them.

### 3.10 Products — `/products`

Product-level catalog, built like a marketplace back-office (Shopee /
Taobao seller centre) so the team can *maintain* products, not just list
them. Nav row *Products* between Purchase orders and Upload. Working
prototype on the seed data.

**Permissions** — super admins create and edit products and upload images;
everyone else is read-only. For members the page hides "New product", the
"Edit" actions and the edit drawer, and shows a quiet `badge-pill` "View
only · ask a super admin to change products" in the header slot. Server
Actions enforce it (`role === SUPER_ADMIN`), the UI only reflects it. On the
canvas the *Viewer* tweak on the artboard switches between the two states.

**Header** — eyebrow "Catalog", `h1` "Products", right slot:
`button-primary` "+ New product" (super admin only).

**KPI row** — four `card-tile`s at `text-heading-md`, count-up: Products
(active · categories), Revenue · 12 months (full figure) with units sold,
Best seller with share of revenue, **Needs attention** in `brand-amber` with
the breakdown "3 missing image · 1 inactive · 0 not sold 60d".

**Every KPI here is the same query as the table.** Revenue · 12 months, units
sold, best seller and its share all come from one product dataset over one
12-month window — the same one the rows, the footer summary and the order
history on the product page use. The KPI tile covers all products while the
footer summary reflects the active filter, both are labelled as such, and with
no filter on they must read identically. The review found the tiles reading
"RM 0.00 · 0 units sold · 0.0% of revenue" beside a footer reading
"RM 15,565,010.96"; two numbers describing the same thing must never be able to
disagree.

**The Needs-attention breakdown is a to-do list, so make it clickable.** Each
count in "3 missing image · 1 inactive · 0 not sold 60d" is a click target that
sets the matching quick-filter chip below, and the chip row visibly reflects the
selection. A count of zero renders `text-ink-disabled`, is not clickable, and
says so on hover.

**Toolbar** — row 1: search (name or SKU), category select, *Sort*
segmented (*Revenue · Units · Drift · Price · Name*), and a **Grid / List**
view toggle (segmented, icon + label; remembered per user in
`localStorage`). Row 2: **quick-filter chips** — *All · Missing image ·
Inactive · Price moved > 3% · Not sold in 60 days* — with the result summary
"12 products · RM 15,565,010.96 in 12 months" on the right. The quick chips
are the maintenance surface: each one is a to-do list.

**Grid view** (default) — 4-column `card-feature` cards, whole card is a
link to the product. 4:3 image area on `bg-surface-soft` (initials when no
image is set, on canvas with a dash), category `badge-pill` top-left, and a
top-right flag when something needs fixing: *Inactive* (`ink-tertiary`),
*No image* or *Not sold 60d* (`brand-amber`). Body: name clamped to two
lines, `SKU · per unit` in mono caption, list price at `text-heading-sm`
with the 12-month drift beside it, and a hairline footer "2,284 sold · 11
buyers · RM 97.2k". Hover lifts 2px with `shadow-sm` and firms the border.
Page sizes 8 / 12 / 30 / 50.

**List view** — the §4 table: thumbnail · Product (name links to detail,
SKU · unit) · Category · List price · Drift · 12m · Units · 12m · Revenue ·
12m · Buyers · Status badge · ›.

### 3.11 Product detail — `/products/[id]`

Reached by clicking a product anywhere (catalog card or row, line items on
the PO detail and review screens once matched, the dashboard's product
share and price-drift lists). Working prototype on the seed data, with count-up.

**Breadcrumb + header** — "‹ Products / Stone", eyebrow "ZG-STN-040 · Stone
· per pc", `h1` = product name, `accent-green` *Active* badge. Right slot for
super admins: `button-secondary` "Add images", `button-primary` "Edit
product"; for members the "View only" badge.

**Top split (5 / 7)**

- *Gallery* — 4:3 main image at `rounded-lg` with a "1 / 3" counter;
  thumbnail strip of 1:1 tiles (selected has a 2px `ink` ring); a dashed "+"
  tile for super admins.
- *Facts card* — List price at `text-display-md` on the left; on the right
  "Avg billed · 12m" with a caption "1.6% below list on average"
  (`brand-amber` when below, `accent-green` above, gray at list). Description
  paragraph. Then a 3-column fact grid: SKU, Category, Unit, First sold,
  Last sold ("20 Aug 2026 · 14d ago"), Updated (date · who).
- *Six stat tiles* under the facts card, each `text-heading-md` with a
  caption:

| Tile | Meaning |
|---|---|
| Revenue · 12m | with "% of all sales" |
| Units · 12m | with "units per order" |
| Orders · 12m | with "from N buyers" |
| Price drift · 12m | first month's avg billed → last month's, coloured |
| Sales velocity | units per week over the last 8 weeks |
| Attach rate | % of all POs in 12 months that include this product |

**Price trend** — `card-section` line chart, 12 monthly points, same rules
as §3.2 (max/min chips, hover, gridlines). Segmented switch *Avg unit price
/ Units sold*. In price mode a dashed `brand-link` reference line marks
**today's list price** ("List RM 43.27"), so discounting reads as the gap
between the line and the dash. Months with no sales leave a gap rather than
a fake zero. Title "RM 41.98 → RM 42.88 over 12 months".

**Who buys it · Bought together** — two `card-feature`s: top 5 buyers by
value (horizontal bars, names link to the buyer page); the five products
most often on the same PO with "33% of orders". Bought-together is the
cross-sell hint for the sales team.

**Order history** — eyebrow "Order history · last 12 months · 104 purchase orders", status
chips, paginated table: PO number · Buyer · PO date · Qty · Unit price
(`brand-amber` when billed > 1% under that day's list price) · Line total ·
PO total · Status · ›.

**Edit product drawer** (super admin) — opens from "Edit product"; drawn
inline at the bottom of the artboard. Two columns, 720px: fields (Name, SKU,
Category, List price — with the caption "Changing it records a price history
entry — the trend above keeps the old value" — Unit, Description), Active
toggle, Archive / Cancel / Save. Right column on `bg-surface`: the image
grid — existing images with a "Thumbnail" badge on the first and ✕ to
remove, a dashed dropzone "Drop images here — or browse · PNG, JPG, WebP ·
up to 5 MB", an in-progress upload row with a progress bar, caption "Drag to
reorder. Images are resized to 1600px on upload; the original is kept."

Images upload through the same presigned-R2 path as POs (§7), key scheme
`products/{productId}/{imageId}.{ext}`, with a 1600px WebP derivative
generated on the `complete` call. List-price changes append to
`ProductPrice` so the trend and any future margin math have history.

## 4. Shared component specs

**Table**
- Header row: `text-eyebrow font-mono text-ink-tertiary` in **sentence case**,
  hairline bottom border, `py-sm`. Column headers are scanned on every pass;
  the mono family is what marks them as chrome, and the all-caps only slowed
  reading.
- **Every column header sorts.** Clicking a header sorts by that column;
  clicking it again reverses. The active header goes `text-ink` with a ↑ / ↓
  caret appended, the others stay `text-ink-tertiary`. First click is
  descending for numbers, dates and money and ascending for text and badges,
  so the useful end comes first either way. Sorting runs on the underlying
  value, never the formatted string, and resets to page 1 while leaving the
  filters alone. Where a screen also has its own sort control (the Products
  segmented control, §3.10) the two share one piece of state and stay in step.
- The two **line-item** tables (§3.4 and §3.6) are the deliberate exception:
  their order is the order the lines appear on the customer's document, and
  that correspondence is what lets someone check them against the page shown
  beside them.
- Body rows: `text-body-sm text-ink`, `py-sm px-md`, hairline between rows,
  no zebra striping.
- Numeric columns right-aligned, tabular figures (`font-variant-numeric:
  tabular-nums` — add a `tabular-nums` utility).
- Money formatted `RM 12,400.00`.

- **Truncation always has a way back.** Any cell that ellipsises carries a
  `title` with the full value — buyer names, product names, filenames, item
  lists. Where the value is the point of the screen, give it room instead of a
  tooltip (see the review form's full-width Buyer field, §3.4).

**Pagination — every table, no exceptions.** Footer row below the card:
left, `text-body-sm text-ink-secondary` "1–10 of 408" then a page-size select
(`text-input` at 36px) with **10 / 30 / 50 per page**, default 10; right,
`button-tertiary` Prev · "Page 3 of 41" · Next, disabled ends in
`text-ink-disabled`. Server-side pagination (Prisma `skip`/`take`) once Neon
is wired; changing page size resets to page 1.

**Status badge** (`badge-pill`, `rounded-full`, `text-caption`, `px-sm py-xxs`)

| Status | Text color | Background |
|---|---|---|
| Uploading / Extracting | `accent-blue` | `surface-soft` |
| Needs review / Ready to review | `brand-amber` | `surface-soft` |
| Confirmed / Delivered | `accent-green` | `surface-soft` |
| Failed / Overdue | `accent-red` | `surface-soft` |
| Pending access / Invited | `ink-secondary` | `surface-soft` + 1px `brand-amber` ring |
| Disabled / Inactive | `ink-tertiary` | `surface-soft` |

Background is always `surface-soft` — colored text on neutral, never colored
fills. **`accent-blue` means a process is running right now** and nothing else:
an overdue reorder is a risk, so it is red; a new buyer is a standing state, so
it is neutral. Pending and Invited are neutral text inside an amber ring rather
than amber text, so a queue someone must approve never looks like a document
someone must review. Every badge carries its label — colour never carries
meaning alone.

**Stage badge** — the same `badge-pill` once a PO is confirmed. Text is
`ink` for the five in-progress stages and `accent-green` for *Delivered*;
the 6px dot carries the stage's ramp color so the badge still reads at a
glance.

**Stage palette** — six distinct hues, one per stage, in stage order. Used
for stacked-bar segments, stage-bar segments, legend swatches and badge dots
— never for text. Add these to `@theme` as `--color-stage-1` … `-6`:

| Stage | Hex | Hue |
|---|---|---|
| Order placed | `#4a3aa7` | violet |
| In production | `#2a78d6` | blue |
| QC passed | `#1baf7a` | aqua |
| In warehouse | `#eda100` | yellow |
| Delivering | `#e87ba4` | pink |
| Delivered | `#04642a` | deep green |

**Two ramps were tried first and both failed.** Five ink tints read as one
grey smear — neutrals of similar lightness give the eye no second cue, and
the lightest step sat at 1.62:1 against the `surface-soft` card, so *Order
placed* all but vanished. A single-hue blue ramp passed the `dataviz` ordinal
checks but was still six shades of one colour, which is a poor way to answer
"how much of this bar is in production". Six stages in a stacked bar have to
be **identified**, not ranked by eye — the order is already carried by the
legend, the stepper on PO detail, and the fixed stacking order — so the
palette is categorical.

Validated with the `dataviz` script against the `#f8f9fa` chart surface,
all-pairs: chroma floor passes, normal-vision separation passes with the
worst pair at ΔE 16.3, and CVD separation warns at ΔE 6.1 on pink ↔ aqua
under deuteranopia. That warning is discharged the way the skill requires —
every segment is directly labelled in the legend, segments are held apart by
a 2px surface gap, and the hover tooltip names each stage with its count.

Two constraints shaped the choice. **No orange or red**, because against a
green they collapse to ΔE 2.6 under protanopia, and *Delivered* has to stay
green. And *Delivered* is the deep `#04642a` rather than a mid green, which
pushes it clear of the aqua at *QC passed*.

**Stage stepper** (`StageStepper`) — `grid-cols-6`, a 2px hairline track at
node centre-height from the first node's centre to the last's, a second
2px `ink` track from the first to the current node. Node 24px
`rounded-full`; label `text-body-sm`; caption `text-caption
text-ink-tertiary`. Takes `stages`, `current`, and `events` (for the
captions); knows nothing about POs so it can be reused. Carries the
breathing loop described in §3.6 on whichever node is current — the only
animation in the app besides the KPI count-up.

**Toast** — `bg-ink text-canvas rounded-md shadow-sm p-md`, bottom-right,
auto-dismiss 4s, optional lavender link (`text-brand-link` on dark reads fine).

**Skeleton** — `bg-surface-soft rounded-xxs` blocks, `animate-pulse`.

---

## 5. Mock data

Implemented as the deterministic seed in `prisma/seed.ts` (see `01-foundation.md`).
There is no mock module; every screen reads Neon.

**Buyers (11)** — Acme Industrial Sdn Bhd, Northwind Traders, Kelana Steel,
Sunway Packaging, Bluewave Logistics, Meridian Chemicals, Orchid Textiles,
Tanjung Electrical, Pacific Timber, Selatan Plastics, Hexa Components.

**Products (12)** — each with SKU, category (Stone, Plants, Furniture,
Decking, Structures, Water, Screens & fencing), unit, a base price and a
yearly **price drift** (−9% to +18%) so billed unit prices move over time:
Bamboo garden screen 1.8m · Granite stepping stone 40cm · River pebble, 20kg
bag · Japanese maple, 1.5m · Cedar bench 1.2m · Raked gravel, white, 25kg ·
Stone lantern 60cm · Moss mat 50×50 · Teak deck tile 30cm · Bonsai juniper,
10yr · Timber pergola kit 3×3m · Koi pond liner 4×5m. Three have no image.
A line's unit price = base × (1 + drift × years since 1 Sep 2025) × ±2%
noise.

**Purchase orders (~400 over the last 12 months)** — generated
deterministically from a seeded RNG so every screen and every filter agrees:
0–3 POs per weekday, occasional Saturdays, none on Sundays; buyer picked with
a skew so the top three carry ~55% of value; 2–6 line items each from the
product list. Status: the last two days mix Needs review / Extracting, days
2–5 are half Needs review, ~3% Failed overall, everything else Confirmed.
Uploaded by Chris 60% / Aisha 40%. Totals land between RM 1k and RM 150k.
Every Confirmed PO also gets a **stage** from its age with ±3 days of noise:
< 3 days Order placed, < 8 In production, < 12 QC passed, < 16 In warehouse,
< 20 Delivering, else Delivered (with a 12–22 day order→delivered lead time).
Stage events are generated backwards from that so PO detail, the list and
the dashboard agree.

**Users (2)** — Chris Lam (chris@…), Aisha Rahman (aisha@…), both with
Google avatar URLs (use placeholder circles in the design).

The dashboard derives every bucket, KPI and top-N from this set at
runtime — there is no hand-written chart data.

---

## 6–10. Data model, architecture, routes, build order, open questions

Moved. These sections are now owned by `docs/specs/00-master.md` (data model,
architecture, environment, routes and files, conventions) and the phase files
`docs/specs/01-…` to `09-…` (build order and acceptance criteria). The open
questions were resolved on 2026-09-04 and the decisions are logged in
`00-master.md §2`. This document keeps §1–§5: product summary, design
principles, every screen, shared component specs and the seed-data shape.
