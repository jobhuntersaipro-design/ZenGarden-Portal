# Phase 11 — Purchase order revamp

Branch `feature/po-revamp`. Depends on: 04 (extraction, review, confirm),
05 (PO list and detail), 08 (products), 09 (super admin).

Goal: six changes to how a purchase order is read, corrected and disposed of —
a super admin can delete one, two unused fields come off every screen, the
original document can be magnified, a remark is visible, product codes drive
the catalogue instead of being matched against it, and the line-items table
stops clipping its own columns.

## 1. Data model

One migration:

```prisma
model Product {
  needsReview Boolean @default(false)  // created from a PO; details not filled in yet
}
```

And `"Uncategorised"` is appended to `PRODUCT_CATEGORIES` in
`src/lib/product-categories.ts`. It **must** be a real member of that list, not
free text: the list is fixed on purpose, and the comment above it says why —
"A free-text category would fragment into 'Stone', 'stone' and 'Stones' inside
a week, and every share chart would then be wrong in a way nobody notices."

**`deliveryDate` and `buyerReference` keep their columns.** They stop being
read, written or extracted (§3). Dropping them would destroy that data on the
400 existing orders for no gain, and keeping them makes the decision
reversible.

**`notes` is not renamed in the database.** It becomes "Remark" in the UI
(§4). Renaming the column would touch `confirmPurchaseOrder`, the edit sheet
and the audit trail for a label change.

## 2. Delete a purchase order — super admin only

`deletePurchaseOrder(id, typedPoNumber)` in `src/actions/purchase-orders.ts`,
opening with `requireSuperAdmin()`, Zod-validated, returning the usual
`{ success, data } | { success, error }`.

The confirmation requires the PO number typed exactly — trimmed and
case-insensitive, matching `deleteUser`'s email check in Phase 09. A mismatch
returns a failure and writes nothing.

### What the transaction does

| Row | Fate | Why |
|---|---|---|
| `PurchaseOrder` | deleted | the request |
| `LineItem` | cascades | already `onDelete: Cascade` |
| `PoStageEvent` | cascades | already `onDelete: Cascade` |
| `Document` | **kept** | the original PDF stays; re-review beats re-upload |
| R2 object | **kept** | as above |
| `Extraction` | `CONFIRMED` → `SUCCEEDED` | returns the document to the review queue instead of orphaning it |

### Three things that are easy to get wrong

- **The revision chain.** `revisionOfId` is `ON DELETE SET NULL` (confirmed in
  `20260905105522_init`), so deleting a superseded original does not error — it
  leaves the newer revision intact with `revisionOfId = null`. When the order
  being deleted has a `supersededBy`, the dialog says so: "Revision 2 of this
  order will stay, no longer linked to this one."
- **The figures move.** Dashboard, buyer and product analytics all read
  confirmed orders, so a deletion changes historical totals immediately. The
  dialog states which month is affected rather than letting it be a surprise.
- **`Extraction.status` is what makes the document reachable again.** Leaving
  it `CONFIRMED` would strand the upload: it would appear in no queue and have
  no order.

### Where it lives

A `Delete` button in the PO detail header, after `Edit`, rendered only when
`session.role === SUPER_ADMIN`. **Not** on the list — deleting is rare and
deliberate, and opening the order first means seeing what is about to go.

On success: toast, then redirect to `/purchase-orders`.

## 3. Delivery date and buyer reference come out

Removed from:

- PO detail summary card (`src/app/(portal)/purchase-orders/[id]/page.tsx`)
- The review form (`src/components/review/ReviewForm.tsx`)
- The edit sheet (`src/components/purchase-orders/EditPurchaseOrderSheet.tsx:22-23`)
- `PoExtractionSchema` (`src/lib/extraction/schema.ts:8,10,53,55`) and the
  system prompt (`src/lib/extraction/prompt.ts:16`) — there is no point asking
  Claude for fields nobody reads, and every field removed is one less thing to
  get wrong
- `confirmPurchaseOrder` and `saveDraft` stop writing them

The columns stay. Nothing else reads them; a grep for `deliveryDate` and
`buyerReference` outside the schema and migrations must come back empty when
this is done.

## 4. Remark

`notes` surfaced, under the label **Remark**:

- **PO detail**: a row in the summary card, showing the text or `—`. It can be
  long, so it wraps rather than truncating; it is the one field on that card
  that is prose.
- **Edit sheet**: the existing `Textarea` at `EditPurchaseOrderSheet.tsx:78-91`,
  its label changed from "Notes" to "Remark".
- **Activity**: an edit to it already logs through the existing edit path; the
  entry reads `Edited: remark`.

Max 2000 characters, validated in `src/lib/validation/purchase-orders.ts`.
Not on the review form: a remark is something added while working an order,
not transcribed off the document.

## 5. Product codes drive the catalogue

This reverses part of the 2026-09-06 product-matching decision, deliberately.
That decision stands where it still applies — **nothing is ever matched
fuzzily** — but a code the catalogue has never seen now creates a product
instead of leaving the line unmatched.

### `resolveProducts` replaces `matchProducts`

In `src/lib/extraction/run.ts`:

1. **Exact SKU, case-insensitive** → link to that product. Archived products
   are still excluded, so an archived code creates a new active row rather than
   silently reviving a retired one.
2. **Name matching is dropped.** A code is now the only identity. Two active
   products sharing a name was always ambiguous, and with auto-create the
   fallback would attach a line to the wrong product *and* skip creating the
   right one.
3. **Code present, unknown** → create:

   | Field | Value |
   |---|---|
   | `sku` | the code, trimmed |
   | `name` | the line description, trimmed |
   | `unit` | the line's unit, or `"unit"` when absent |
   | `listPrice` | the line's unit price |
   | `category` | `"Uncategorised"` |
   | `active` | `true` |
   | `needsReview` | `true` |

4. **No code** → `productId` stays null, exactly as now. Nothing derives a code
   from a description; the prompt rule forbidding that stays.

**Two lines carrying the same new code create one product.** Codes are
de-duplicated before any write, so creation happens once per distinct code per
document. The whole document still costs one `findMany` plus at most one
`createManyAndReturn` — never one query per line, which is the property the
2026-09-06 matching work established and this must not lose.

`createManyAndReturn` rather than `createMany`: the created ids are needed to
link the lines, and plain `createMany` does not return rows. It is
PostgreSQL-only, which is fine here.

**A concurrent upload can race**, because `sku` is `@unique` and two documents
can carry the same new code at once. `skipDuplicates: true` makes the write
safe, and any code that was requested but not returned is re-read in a second
`findMany` — the loser of the race links to the winner's product rather than
failing the extraction.

### Timing, and what it costs

Products are created at **extraction time**, so the review form shows them
pre-selected. The user chose this over creating them at confirm.

**The consequence, stated plainly: a discarded draft leaves its products
behind.** A misread scan can put junk in the catalogue. `needsReview = true` is
what keeps that visible and fixable rather than silent — it is not a
mitigation of the risk so much as the thing that makes it recoverable. If this
proves noisy in practice, moving creation into `confirmPurchaseOrder`'s
existing transaction is the fix, and it is a small change.

### Naming and surfacing

- The column header and combobox label become **Product Code** on the review
  screen, PO detail line items and anywhere else the field is named.
- The Products page gains a **Needs review** quick-filter chip carrying its
  count, in the same shape as the existing Needs-attention chips.
- `ProductSheet` shows a line on a `needsReview` product — "Added automatically
  from a purchase order. Fill in its category and price." — and clears the flag
  when saved.

## 6. Zoom the original document

`src/components/review/DocumentPreview.tsx` (currently 152 lines) gains scale
state. One component serves both the review screen and PO detail, so both get
it from one change.

- Controls: `−`, the current percentage, `+`, and **Fit**. Steps: 50, 75, 100,
  125, 150, 200, 300%.
- **Fit** is the default and is what the component does today — page width
  equals container width.
- `Ctrl`/`⌘` + wheel zooms; a plain wheel scrolls the page, unchanged.
- Double-click toggles Fit ↔ 100%.
- Above fit, the page **scrolls inside its own container** (`overflow: auto`),
  so the surrounding layout never moves. This is the rule that matters: a
  zoomed document must not widen the page.
- PDFs use react-pdf's `scale` on `<Page>`; images use a CSS transform with
  `transform-origin: top left`. Both paths already exist in this component.
- Buttons are 44px on a phone and carry `aria-label`s; the percentage is
  `aria-live="polite"` so a screen reader hears the change.
- `Fit` is re-applied on container resize, so rotating a phone does not leave
  a stale scale.

## 7. The line-items table stops clipping

**Reproduced 2026-09-07** on `/review/[id]` at 1440px: the "Description" and
"Product" headers collide, the description `Input` is about 88px wide, and
"Unit price" and "Amount" are cut off at the card's right edge.

The cause is `min-w-line-items` — `--spacing-line-items: 720px` — carrying
seven columns, with Product fixed at `w-44` (176px) and Description given no
width at all, so it collapses to whatever is left.

The fix is per-column widths rather than a bigger blanket minimum:

| Column | Width |
|---|---|
| Description | `min-width: 240px`, flexes to take the slack |
| Product Code | 176px, fixed (unchanged) |
| Qty | 80px |
| Unit | 80px |
| Unit price | 112px |
| Amount | 112px |
| Remove | 40px |

`--spacing-line-items` becomes **840px**, the sum of those minimums, and the
table keeps `overflow-x-auto` so it scrolls inside its own container below
that width rather than pushing the page sideways.

Removing delivery date and buyer reference (§3) does not help here — those are
in a different card — so this is fixed on its own terms.

## 8. Tests

Unit (Vitest, node environment; there is no `@testing-library/react` in this
project, so no component tests):

- `resolveProducts`: exact code links; unknown code creates with the fields in
  §5; a line with no code stays null; **two lines with the same new code create
  exactly one product**; an archived product's code creates a new row rather
  than reviving it; a code skipped as a duplicate is re-read and linked rather
  than left null; a twenty-line document issues a bounded number of queries,
  not one per line
- `deletePurchaseOrder`: refuses a non-super-admin; refuses a mismatched PO
  number without writing; sets the `Extraction` back to `SUCCEEDED`
- remark validation: accepts 2000 characters, rejects 2001, trims
- `PRODUCT_CATEGORIES` contains `"Uncategorised"` and `isProductCategory`
  accepts it

Browser, against the live database, all test data removed afterwards:

1. Upload a PO carrying one known code and one invented one — the known line
   arrives pre-selected, the invented one creates a product marked
   Needs review, and the Products chip count goes up by one
2. Delete a purchase order as a super admin: the order, its lines and its stage
   events go; the `Document` and the R2 object stay; the extraction returns to
   the review queue and the document can be reviewed again
3. A non-super-admin does not see the Delete button
4. Zoom to 200% on both the review screen and PO detail: the document scrolls
   inside its container and the page itself never scrolls sideways
5. The line-items table at 390, 768 and 1440: headers do not collide, the
   description is legible, and Amount is reachable
6. A remark saves, shows on detail, and appears in Activity

`npm run build`, `npm run lint` and the full suite pass before any commit.

## 9. Acceptance criteria

1. A super admin can delete a purchase order after typing its number; nobody
   else sees the action.
2. Deleting keeps the original document and returns it to the review queue.
3. Delivery date and buyer reference appear nowhere in the app and are no
   longer extracted; their columns and data survive.
4. A remark can be read on PO detail, edited in the sheet, and shows in
   Activity.
5. A line whose product code exists links to that product.
6. A line whose product code is new creates exactly one product, marked
   Needs review, and links to it.
7. A line with no product code stays unmatched, and nothing invents a code.
8. Products created this way are findable from the Products page.
9. The original document zooms on both screens, and zooming never widens the
   page.
10. The line-items table shows every column legibly at 390, 768 and 1440.
11. No raw hex, px font size or arbitrary Tailwind value is added.

## 10. Out of scope

- Dropping the `deliveryDate` and `buyerReference` columns — see §1.
- Fuzzy product matching. Exact code only; that rule is unchanged.
- Bulk delete from the purchase orders list.
- Merging duplicate products created by a typo'd code. They surface as
  Needs review and are deleted or edited by hand.
- Rotating or annotating the document; zoom and pan only.
