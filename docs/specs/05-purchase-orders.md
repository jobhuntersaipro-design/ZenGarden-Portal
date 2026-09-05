# Phase 05 — Purchase orders list and detail

Branch `feature/purchase-orders`. Depends on: 04. Screens: design reference
§3.5 and §3.6, shared components §4 (table, pagination, badges, stepper).

Goal: the list is the single place records are opened from; detail shows the
paper beside the data and drives the fulfillment lifecycle.

## 1. Shared table machinery (built here, reused by 06–09)

- `src/components/portal/DataTable.tsx`: generic over a row type; props
  `columns` (`key`, `header`, `align`, `sortable`, `defaultDir`, `cell`),
  `rows`, `sort`, `onSortChange` (writes `?sort=&dir=`), `emptyText`,
  `rowHref`. Header styling per design reference §4. Every column sortable by
  default; first click direction per column type.
- `TablePagination.tsx`: reads `?page=&size=`, sizes 10/30/50, renders the
  footer row from design reference §4.
- `src/lib/queries/pagination.ts`: `parsePagination(searchParams)` →
  `{ skip, take, page, size }`; `parseSort(searchParams, allowed, default)`.
- `StatusBadge` (intake) and `StageBadge` (stage dot) per design reference §4.
  Both read the one status token set (G2): amber `brand-amber` for Needs
  review, `accent-blue` only for Extracting (a process in flight),
  `accent-red` for Failed, `accent-green` for Delivered/success, and a text
  label always beside the colour. The filter chips above the table use the
  same tokens as the badges inside it — one status, one colour, everywhere.
- Money cells use `formatMYR`; date cells `formatDate` in KL time.

## 2. List — `/purchase-orders`

**Merged row model.** `src/lib/queries/purchase-orders.ts#listPurchaseOrders(params)`
returns rows of one shape from two sources:

| Source | Included when | Status shown | Row link |
|---|---|---|---|
| `PurchaseOrder` (latest revisions only) | always | stage badge | `/purchase-orders/[id]` |
| `Extraction` in `RUNNING`/`SUCCEEDED`/`FAILED` | status filter is All, Needs review, Extracting or Failed | Extracting / Needs review / Failed | `/review/[id]` |

Implementation: one raw SQL `UNION ALL` view (`prisma.$queryRaw` with a
typed result) is acceptable here because sorting and paginating across two
tables in Prisma's query API is not possible. Put the SQL in
`src/lib/queries/po-list.sql.ts` with parameters bound, never interpolated.
Columns: id, kind, poNumber, buyerName, buyerId, poDate, itemCount, total,
status, stage, uploadedBy{name,image}, confirmedBy{name,image}|null, fileType, revision.

The page header carries the "Upload PO" primary button, which is the only
route to `/upload` (G1); Upload is not a sidebar destination.

**Status chips carry their count.** The "Needs review" chip renders its count
when it is greater than zero — "Needs review 4" — in the chip's own amber
tokens. The number comes from the same query that feeds the table (the
aggregate pass over the filtered/merged set described below), never a
hard-coded or separately-maintained figure, so a row that leaves the queue
changes the chip on the same render. A count of zero shows the chip with no
number, not "Needs review 0".

Filters from the URL, all AND-ed: `q` (PO number `ILIKE` or any line-item
description `ILIKE`, for drafts search `draftJson` text), `buyer`, `by`
(uploader), `status` chip, `stage` (including `not-delivered`), `from`/`to`
(used by the dashboard's "in range" table). Summary line counts and sums the
filtered set (a second aggregate query).

"Confirmed by" for a draft row reads "Not confirmed" and sorts first when
that column is sorted ascending.

## 3. Detail — `/purchase-orders/[id]`

A breadcrumb sits above the page header: "Purchase orders / {PO number}",
where "Purchase orders" is a `brand-link` link back to the list and the PO
number is plain `ink-secondary` text.

Server component loads the PO with buyer, line items (with product), stage
events (with user), document, revision links. 404 if missing or if the id is
an old revision (redirect to the latest instead).

**Lifecycle card** per design reference §3.6. `StageStepper` component with
the breathing animation defined there, implemented as CSS keyframes in
`globals.css` (`@keyframes stage-breathe`) gated by `prefers-reduced-motion`.
`AdvanceStagePopover` calls `advanceStage(poId, note?)` and stays the filled
`button-primary`. For super admins, **"Move back" is a `button-secondary`
sitting immediately to its left** — a real button in the action row, not a
text link below or beside it. It opens a confirmation dialog headed "Move back
to {previous stage}?" with a **required** note field (Confirm disabled until
the note is non-empty) and the line "This move is recorded in the timeline
with your name." Confirming calls `revertStage(poId, note)`. Members see
neither the button nor the dialog.

Both actions: `requireUser`, load the PO, compute the target with
`nextStage`/`prevStage`, refuse if none, one transaction updating `stage`,
`stageChangedAt` and inserting the event, `revalidatePath` for the detail,
the list and `/`. Concurrency: include `where: { id, stage: currentStage }`
in the update so two people clicking at once cannot double-advance; the loser
gets "This order was already moved. Refresh."

**Document + data split** per §3.6, reusing `DocumentPreview` from Phase 04.
"Download original" hits `/api/documents/[id]/url?download=1` (presigned GET
with the original filename). "Edit" opens `EditPurchaseOrderSheet` (a
`Sheet`, 560px) with the same field set as the review form minus confidence,
saving through `updatePurchaseOrder(poId, patch)`; line items are editable
too and totals are re-validated. Any edit appends an `Activity` entry
(a `PoStageEvent` with `kind = EDIT`, `fromStage = toStage = current` and
`note = "Edited: buyer reference, delivery date"`; rendered as "Edited …" in
the activity list and ignored by every analytics function).

**Revisions**: when `revisionOfId` is set, the header pill reads "Rev 2" and
a caption links to the superseded PO ("Replaces PO-… confirmed 2 Sep"); the
old one shows "Superseded by Rev 2 →" and hides the lifecycle actions.

## 4. Tests

- Vitest: `po-stages.test.ts` (already from 01, extend with `stageIndex`);
  `parseSort` and `parsePagination` edge cases; `advanceStage` with mocked
  Prisma for the concurrency guard.
- Playwright: list → open → advance → stepper shows the new stage and the
  list badge updates.

## 5. Acceptance criteria

1. The list shows both confirmed POs and the seeded backlog; each status chip
   filters correctly; search finds a PO by a line-item word.
2. Every column sorts both directions; sorting keeps filters; changing any
   filter returns to page 1; page size persists in the URL.
3. Summary line totals match the filtered set.
4. Detail renders the PDF beside the data; the pager moves through pages.
5. Advancing moves the stepper, writes an event with the note, and toasts.
   For a super admin "Move back" renders as a secondary button immediately
   left of the primary Advance button, opens the "Move back to {previous
   stage}?" dialog, and cannot be confirmed with an empty note; the resulting
   timeline entry names the actor. Members see no Move back control at all.
6. At Delivered the pill disappears and the heading shows days from order.
7. Editing the delivery date shows up in Activity as an edit entry.
8. Two browser tabs advancing the same PO: the second gets the refresh message.
9. With four extractions awaiting review the chip reads "Needs review 4" and
   the number matches the row count the chip filters to; confirming one drops
   it to 3 on the next load; at zero the chip shows no number.
10. PO detail shows the breadcrumb "Purchase orders / {PO number}" above the
    header and the first part navigates back to the list.
11. Buyer and product names that ellipsise in the table carry a `title` with
    the full value (G4).
