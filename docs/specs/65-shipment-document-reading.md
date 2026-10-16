# Phase 65 — AI reads the shipping papers and checks them against each other

**Goal:** Drop any shipping paper on a shipment and the AI says what it is,
files it in the right slot, reads its figures, and checks them against the
POs, the booking and the other papers. A mismatch is **flagged, never
blocking**. Builds on Phases 63–64.

**Branch:** `feature/shipment-reading`, from `main` after Phase 64.

**Decided:** AI reads the invoice, packing list and BL (2026-10-16). The
customs form and Form D are "just for upload" — the AI only identifies them
and reads their reference number.

## 1. What is reused

- `readDocument` (`src/lib/extraction/extract-po.ts`) — the one Claude call
  every reader shares, with the model chosen in Settings (`AppSetting`).
- `documentKind`-first schemas — the BC and PO readers already decide what a
  file is before reading it.
- `expireStaleExtractions`'s rule — a read stuck past 5 minutes fails.
- The certificate upload's pattern for "AI chose the type, a person changes
  it, a dialog asks before the change".
- `match-products.ts` scoring for packing-list lines to catalogue products.
- `vesselName` for comparing vessels.

## 2. Data

On `ShipmentDocument`, one additive migration:

```prisma
enum DocReadStatus { NOT_READ READING READ FAILED }

  readStatus DocReadStatus @default(NOT_READ)
  readJson   Json?   /// What the AI returned, untouched
  readError  String?
  readAt     DateTime?
  /// The document's own number: invoice no., BL no., declaration no., Form D ref.
  docNumber  String?
```

Files uploaded before this phase stay `NOT_READ` with a **Read with AI**
button; nothing is back-read automatically (cost).

## 3. Reading

### 3.1 Drop any file

The shipment page's Documents card gains a drop zone, "Drop any shipping
document". The file uploads first (Phase 63 routes, with `type` unset →
the complete route stores it as `pending`), then one `readDocument` call with
a classifier schema returns `documentKind` plus that kind's fields.

- Kind is one of the five types → shown as "Read as **Packing list**" with the
  types as radio cards (the certificate pattern); choosing another asks first.
  Saving files it into that slot (superseding a current one only after "This
  replaces `PL-old.pdf`. Keep both versions?" — Replace / Cancel).
- `booking_confirmation` → "This is a booking confirmation" with a link to
  upload it as one; not filed here.
- `purchase_order` or `other` → the reason, and the file can still be filed by
  hand.
- A slot's own Upload button skips classification but still reads the fields.

### 3.2 What each read returns

Nullable, never optional (a missing key means the model forgot; the PO schema
rule). Dates as `yyyy-mm-dd`.

- **Packing list:** `docNumber`, container numbers + seals, per line
  `{ description, sku, cartons, piecesPerCarton, poNumber }`, total cartons,
  gross/net weight (kg), CBM.
- **Invoice:** `docNumber`, date, currency, per line
  `{ description, sku, cartons, unitPrice, amount }`, total.
- **Bill of lading:** `docNumber` (BL no.), `isDraft` (the word DRAFT, "not
  negotiable copy for checking", etc.), shipper, consignee, notify party,
  vessel, voyage, POL, POD, containers + seals, packages, gross weight,
  shipped-on-board date.
- **Customs form:** form type (K2/K3/K4 → the slot's label), `docNumber`,
  date.
- **Form D:** `docNumber`, issue date, consignee, exporter.

### 3.3 Draft BL

The customer keeps the final BL only (decision 4). A BL read with
`isDraft: true` files normally but its slot reads **"Draft — upload the final
BL"** and stays not-done for the checklist. A person can override ("This is
the final") — recorded in the activity.

## 4. Checks — one pure module

`src/lib/shipments/cross-check.ts`, no Prisma, unit-tested. Inputs: the
shipment's PO lines (product, cartons), the current BC's fields, and each
current paper's `readJson`. Output: a list of
`{ check, state: "ok" | "mismatch" | "cannot_check", detail }` with exact
figures.

| Check | Compares |
|---|---|
| Packing list vs orders | Cartons per product: Σ packing-list lines vs Σ PO lines across every PO on the shipment. Per product: match / short by N / over by N / on the list but on no PO / on a PO but not packed. |
| Packing list POs | Every PO number printed on the list is on the shipment |
| Invoice vs packing list | Total cartons; per product where both have it |
| BL vs packing list | BL packages vs total cartons; gross weight within 1% |
| BL vs booking | Vessel (`vesselName` on both), POL, POD, container count |
| BL consignee | Token match against the buyer's name |
| Form D consignee | Token match against the buyer's name |

Product matching reuses `match-products.ts`; a line it cannot match with
confidence counts under "cannot check", never as a mismatch. A check whose
inputs are missing is `cannot_check` and says which paper is missing — not a
silent pass.

### 4.1 Where checks show

- A **Checks** card on the shipment, under Documents: each check one row,
  green or amber, the figures in the sentence ("Packing list has 1,200 cartons
  of ZEN 1L — Goat's Milk; the orders have 1,240 (40 short)").
- A mismatch can be **accepted** with a reason by `shipment.manage` — recorded
  with who and when, like a confirmed totals mismatch; it then reads green
  with "Accepted by …".
- The shipment's status (Phase 64) gains **Needs checking** while any
  mismatch is unaccepted; the dashboard's overdue line is unchanged, a third
  line "N shipments have document mismatches" links to
  `/shipments?status=mismatch`.

## 5. Acceptance criteria

1. Against a local Messages API stand-in (the BC phase's rig): a packing list
   PDF classified and filed; its lines read; the orders check reads "40 short"
   for a fixture built 40 short, green for one that matches.
2. A BL with DRAFT printed reads "Draft — upload the final BL" and the slot
   stays not done; override works and is in the activity.
3. A BC dropped on the shipment is refused with the link to the BC upload.
4. Changing the AI's type asks first; going back to its choice does not.
5. Accepting a mismatch needs a reason; the card and the status follow.
6. `cross-check.ts` tests cover every row of §4, with counterfactuals watched
   failing (summing per PO instead of across the shipment; treating an
   unmatched line as a mismatch).
7. A read stuck past 5 minutes reads Failed with Try again.
8. No overflow at 390 / 768 / 1440; tests, `tsc`, lint, build clean.

## 6. Not verifiable here, said up front

Claude on the customer's real papers — the rig has no API key, so prompts are
written against the shapes described, not tuned on real files. **Ask the
customer for one real set** (packing list, invoice, final BL, K2, Form D for
one shipment) before this phase is built; it is the difference between a
prompt that guesses and one that is checked.

## 7. Out of scope

Generating a packing list or invoice from the PO. Reading the draft BL to
compare drafts. OCR of handwritten forms beyond what Claude reads.
