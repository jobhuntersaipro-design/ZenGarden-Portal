# Phase 64 — Shipment tracking: what is late, and where to look

**Goal:** A missing paper becomes a **late** paper on a date the team can see
coming, the Shipments list can be filtered to exactly the work, and the
dashboard says when something is overdue. Builds on Phase 63; no new upload.

**Branch:** `feature/shipment-tracking`, from `main` after Phase 63.

**Decided:** alerts are the dashboard only — no email (2026-10-16).

## 1. When a paper is due — one pure module

`src/lib/shipments/due.ts`, no Prisma, unit-tested, Kuala Lumpur calendar
dates through `src/lib/dates.ts` (`@db.Date` columns compared as date
strings, never timestamps — the `dateColumnRange` trap).

Every rule is anchored to the **current booking's** ETD (POL) or ETA (POD).
Without a booking only the first rule can fire.

| Slot | Due | Why |
|---|---|---|
| Booking | 7 days after the shipment was created | A shipment with no space booked is stalled |
| Packing list | ETD − 2 days | Needed for the export declaration and the BL |
| Customs form | ETD | Declared before the vessel leaves |
| Bill of lading (final) | ETD + 5 days | Issued after departure; Indonesian customs need it to release |
| Form D (when required) | ETA − 3 days | Needed at import to claim the lower duty |
| Invoice | never | Reference only |

**These day counts are defaults chosen here, not the customer's.** They live
as one exported constant, `DOCUMENT_DUE_DAYS`, so changing one is one line.
Confirm them with the customer before shipping.

A slot is `overdue` when it is missing and today is **after** its due date,
`due_soon` when missing and due within 3 days, else as Phase 63. The
checklist (Phase 63 §5) gains these two states; it stays the one function
every screen reads.

**Shipment status**, derived, never stored:

| Status | When |
|---|---|
| Complete | every required slot done |
| Overdue | any slot overdue |
| Due soon | any slot due soon, none overdue |
| No booking | no BC linked, not yet overdue |
| In progress | everything else |

**A finished shipment leaves the worklist.** Complete is final; a shipment
whose every PO is `DELIVERED` and is still missing papers stays Overdue —
that is the case the customer's Indonesian release depends on.

## 2. The Shipments list, filtered

Adds to Phase 63's list, all in the URL, a filter change resets `page`:

- **Status chips** with counts: All · Overdue · Due soon · No booking ·
  In progress · Complete. Default **All**, sorted by status (Overdue first)
  then ETD, rather than hiding Complete by default: a hidden default is a
  filter the reader cannot see (lessons §2).
- **Missing** select: any one slot ("Missing bill of lading").
- **Market**, **Buyer** selects read off the rows (the buyer-roster rule:
  never offer a value nothing carries; a stale value is dropped, the toolbar
  renders the resolved filter).
- **ETD** range (`DateInput`, `dateColumnRange`).
- Sort: Status, ETD, ETA, Created.

The **Documents** column's dots gain amber (due soon) and red (overdue), with
the due date in `title` ("Bill of lading — due 21 Oct, 3 days late"). Columns
drop with the card width; the reference stays pinned and the edge fades
(lessons §7).

## 3. The shipment page

- Each slot row prints its due date beside the status: "Due 21 Oct",
  "3 days late" in red, "Due in 2 days" in amber. Nothing for Invoice.
- The header's status badge and a one-line reason ("Bill of lading 3 days
  late").
- **Activity** card: the Phase 63 audit rows, newest first, ten a page (the PO
  feed's pattern): "Aisha Rahman uploaded the packing list `PL-1022.pdf`",
  "… replaced the bill of lading", "… added PO number …", "… linked booking
  MYPKG2610457".

## 4. Dashboard

`WorkQueue` gains two lines, each rendered only above zero (its existing
rule) and each linking to exactly the rows it counts (lessons §2):

- "N shipments have overdue documents" → `/shipments?status=overdue`
- "N shipments past ETD without a bill of lading" →
  `/shipments?missing=BILL_OF_LADING&etd_to=<yesterday>`

Outside the date range, like the rest of `WorkQueue`. Counted by the same
`due.ts` the list filters with, so the line and the list cannot disagree —
verify by clicking each and comparing the count to the list's total.

## 5. Purchase orders

- PO page Shipping card: the shipment's status badge and its late slots in
  red.
- **Advance to Delivered warns, never blocks**, the short-stock rule: when any
  shipment of the order lacks a final BL, the Advance popover reads "No final
  bill of lading on SHP-… yet. It can still be marked delivered." Advancing to
  Delivering on an order on **no shipment** warns "Not on a shipment yet."
- The PO list is untouched (no new column): the shipment is the unit of this
  work, and the list is already at its width limit (lessons §7).

## 6. Acceptance criteria

1. `due.ts` tests cover every row of §1, the day before/of/after each due
   date, a shipment with no booking, Form D not required, and a BC replaced by
   a later one with a different ETD (the later ETD wins). A KL-vs-UTC midnight
   test, watched failing against a timestamp comparison.
2. With fixtures one day either side of each due date, the list's chips, the
   dots, the shipment page and the dashboard lines all agree, measured.
3. Each dashboard line's count equals the total of the list it opens.
4. The Delivered warning appears and the advance still succeeds.
5. No overflow at 390 / 768 / 1440; 44px controls below `sm`.
6. Tests, `tsc`, lint, build clean.

## 7. Out of scope

Email or push reminders. Per-slot owners or assignment. Editing due rules in
the UI (one constant until someone asks).
