# Phase 63 — Shipments: one home for every shipping document

**Goal:** Every paper an export needs — booking confirmation, invoice,
packing list, customs form, bill of lading, Form D — is uploaded into one
place, tied to the purchase orders it ships, and anyone can see at a glance
which papers a shipment still lacks. Document management is the problem this
solves; tracking (Phase 64) and AI reading (Phase 65) build on it.

Asked for as (2026-10-16): "PO → BC (can be from us or them) → Invoice
(optional) → Packing list → Custom form (provided by custom) this is for proof
only → Bill of Lading (provided by vessel when depart) … needed to send to
Indonesia custom for them to release the goods → Form D to reduce tax
(provided by Zen) just for upload … Ideally everything should be tied to PO
level. The point is the document management and tracking."

**Branch:** `feature/shipments`, from `main`.

## 0. Decisions taken with the user (2026-10-16)

| # | Question | Answer | Consequence |
|---|---|---|---|
| 1 | One container for several POs, or one PO per container? | **Several POs** | Papers belong to a **Shipment**, not a PO. A PO reaches its papers through its shipment. |
| 2 | When is the invoice skipped? | Invoice is **for reference** | Invoice slot is **optional** — never "missing". |
| 3 | Form D for Indonesia? | **Yes** | Required when the shipment needs it (§2.4). |
| 4 | Keep the draft BL? | **Final only** | One BL slot; the draft→final check happens outside the portal. |
| 5 | Do buyers see these on the shop? | **No** | Staff only. A separate table from the buyer-visible order documents. |
| 6 | Should AI read invoice / packing list / BL? | **Yes** | Phase 65. |
| 7 | Customs form type | **K2**, sometimes K3/K4, "doesn't matter" | One slot, an optional free label. |
| 8 | Do all POs in a shipment share a buyer? | **Yes** | A shipment has one `buyerId`; only that buyer's orders can be added. |
| 9 | Alerts | **Dashboard is enough** | No email (Phase 64). |

## 1. What already exists, and is reused rather than rebuilt

- **`BookingConfirmation`** (2026-10-08): its own table, uploaded and read by
  Claude, reviewed by a person, with `purchaseOrderId` (2026-10-09) picked on
  its detail page by `linkBookingToPurchaseOrder`. This phase **moves that
  link from PO to Shipment** (§2.3). The BC list, upload, read and review are
  untouched.
- **`OrderShippingCard`** on the PO page lists the PO's BCs with VesselFinder
  links. It becomes the shipment card (§4.4); `VesselLink`/`vesselName` stay.
- **`PurchaseOrderDocument`** (the order's Documents card) is **not** used:
  since 2026-10-06 every file there is shown to the buyer, and decision 5 says
  shipping papers are not. Leaving it alone keeps that boundary by
  construction.
- **Upload plumbing**: presign → browser PUT to R2 → complete with a
  leading-bytes check, exactly as `/api/purchase-orders/[id]/documents/*`.
  Preview through `DocumentPreview`. Copy the shape, not a new mechanism.

## 2. Data model

One migration, `2026xxxx_shipments`. Additive except §2.3.

### 2.1 `Shipment`

```prisma
model Shipment {
  id            String   @id @default(cuid())
  /// SHP-YYMM-NNNN, minted like WebOrder.reference. What staff quote.
  reference     String   @unique
  buyerId       String
  buyer         Buyer    @relation(fields: [buyerId], references: [id], onDelete: Restrict)
  /// Destination, copied from the buyer's market at create, editable.
  market        String?
  /// Whether this shipment needs a Form D (§2.4).
  formDRequired Boolean  @default(false)
  note          String?
  createdById   String
  createdBy     User     @relation("shipmentsCreated", fields: [createdById], references: [id])
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  orders    ShipmentOrder[]
  bookings  BookingConfirmation[]
  documents ShipmentDocument[]

  @@index([buyerId])
  @@index([createdAt])
}
```

`onDelete: Restrict` on the buyer: a buyer with shipments cannot be deleted,
the same rule purchase orders already impose.

### 2.2 `ShipmentOrder` — the POs it carries

```prisma
model ShipmentOrder {
  shipmentId      String
  shipment        Shipment      @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  addedAt         DateTime      @default(now())

  @@id([shipmentId, purchaseOrderId])
  @@index([purchaseOrderId])
}
```

A join table, not `PurchaseOrder.shipmentId`, so a PO split across two
containers costs nothing if it ever happens. Same buyer (decision 8) is
enforced in the action: `po.buyerId === shipment.buyerId`, refused otherwise.

### 2.3 `BookingConfirmation`: `purchaseOrderId` → `shipmentId`

```prisma
  shipmentId String?
  shipment   Shipment? @relation(fields: [shipmentId], references: [id], onDelete: SetNull)
  @@index([shipmentId])
```

A shipment may hold **several** BCs (a rolled booking is re-issued); the
newest by `uploadedAt` is the shipment's current booking and supplies ETD,
ETA, ports and vessels everywhere.

**The migration carries every existing link over**, in SQL, in the same
migration: for each BC with a `purchaseOrderId`, create one `Shipment`
(buyer = that PO's buyer, market = the buyer's market, reference minted by
`row_number()` over `uploadedAt`), one `ShipmentOrder`, and set `shipmentId`.
Then drop `purchaseOrderId` and its index. Read the generated SQL before
accepting it (`PurchaseOrder_documentId_fkey` drift, CLAUDE.md). Count before
and after: linked BCs = shipments created.

### 2.4 Form D required

Markets are free text and a market is a destination **or a retail customer**
— "Super Indo" is an Indonesian retailer, not the word "Indonesia". So
`formDRequired` is an explicit field: **defaulted on** at create when the
market contains `indonesia` or `indo` (case-insensitive, a pure
`formDDefault(market)` with tests over the real market list), and a checkbox
on the create form and the shipment page. A person can always override it.

### 2.5 `ShipmentDocument` — the papers

```prisma
enum ShipmentDocType {
  INVOICE
  PACKING_LIST
  CUSTOMS_FORM
  BILL_OF_LADING
  FORM_D
}

model ShipmentDocument {
  id             String          @id @default(cuid())
  shipmentId     String
  shipment       Shipment        @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  type           ShipmentDocType
  /// Customs only: "K2", "K3", "K4" or what the person types. Free text.
  label          String?
  r2Key          String          @unique // shipments/{shipmentId}/{type}/{uuid}.{ext}
  originalName   String
  mimeType       String
  sizeBytes      Int
  uploadedById   String
  uploadedBy     User            @relation("shipmentDocsUploaded", fields: [uploadedById], references: [id])
  uploadedByName String
  uploadedAt     DateTime        @default(now())
  /// Set when a newer file of the same type replaced this one. Null = current.
  supersededAt   DateTime?

  @@index([shipmentId, type, supersededAt])
}
```

- **One current file per type.** Uploading into a slot that has one sets the
  old row's `supersededAt` and creates the new row **in one transaction**.
  Enforced in the action, not a partial unique index — Prisma's schema cannot
  express one, and `migrate dev` would try to drop a hand-written one.
- **Replace keeps history.** Earlier versions stay downloadable under the
  slot. **Delete** removes only the current file (row and R2 object, after the
  row) and leaves the slot empty; history is untouched.
- Files: PDF, JPG, PNG, 25 MB, checked from leading bytes — the order
  documents' rule. No zip: a zip cannot be previewed or read in Phase 65.

## 3. Permissions

Two keys, group **Shipments** (new `PERMISSION_GROUPS` entry). The migration
inserts the grant rows, as the BC migration did, because `roleCan` reads
stored grants only.

| Key | Meaning | Default roles |
|---|---|---|
| `shipment.view` | Open shipments, their files and checklist | every ops role |
| `shipment.manage` | Create/edit a shipment, add/remove POs, link a BC, upload/replace/delete files | production planner, QC, warehouse, super admin |

No shop route or shop query reads `Shipment` or `ShipmentDocument`. A test in
the style of `shop-stock-leak.test.ts` asserts no shop select reaches either.

## 4. Screens

### 4.1 Navigation

**Shipments** (Title Case, a destination's name), icon `Ship`, after Booking
Confirmations, `permission: "shipment.view"`.

The phone tab bar is already seven tabs at 55px. Default: on a phone,
**Shipments replaces Booking Confirmations** in the bar, and the Shipments page
header carries a "Booking confirmations" link, since a BC is reached through
its shipment there anyway. Measure at 390 before accepting; an eighth tab is
the alternative only if every label still fits at 44px.

### 4.2 `/shipments` — the list (minimal in this phase)

Columns: **Shipment** (reference, buyer underneath) · **Orders** (count;
`title` lists the PO numbers) · **ETD / ETA** (current BC; `—` without one) ·
**Documents** (the checklist dots, §5) · **Created**. Search by reference,
buyer, PO number / Order ID, booking number. Newest first, paged 10/30/50.
`DataTable`, URL state, `useUrlNavigation`. Filters and overdue states are
Phase 64.

Header: **New shipment** (`shipment.manage`).

### 4.3 `/shipments/new`

1. **Buyer** (combobox).
2. **Orders**: that buyer's confirmed POs not yet `DELIVERED`, newest first,
   checkboxes, each `Order ID · PO number · PO date · cartons · stage`. A PO
   already on another shipment shows "Also on SHP-…" and can still be ticked.
   At least one.
3. **Market** (prefilled from the buyer) and **Needs Form D** (prefilled by
   §2.4).
4. Note (optional).

Create → lands on the shipment. Reachable with `?po=<id>` from a PO page,
which preselects that buyer and order.

### 4.4 `/shipments/[id]` — the shipment

Header: `SHP-2610-0001`, buyer (link), market, `N orders · N cartons`, the
completeness line ("4 of 5 required documents"). Edit (market, Form D, note)
and Delete (only while it holds no files and no BC) for `shipment.manage`.

**Orders** card: each PO — Order ID / PO number (link), stage badge, cartons.
Add order (same buyer, same picker as §4.3) and Remove (✕, confirm).

**Booking confirmation** card: the current BC — booking number (link to the
BC page), carrier, POL → POD, ETD/ETA, feeder and mother vessel with
`VesselLink`. Older BCs listed below as "Replaced". **Link a booking** opens a
picker of BCs with no shipment (newest 200, `booking no. · ETD · file name`);
**Upload a booking** goes to the existing BC upload. No BC reads "No booking
yet".

**Documents** card: one row per slot, in the flow's order:

| Slot | Shown as |
|---|---|
| Packing list | Required |
| Invoice | Optional ("for reference") |
| Customs form (K2) | Required; label select K2 / K3 / K4 / Other |
| Bill of lading (final) | Required |
| Form D | Required, or "Not needed" when `formDRequired` is off |

Each row: status dot, the current file's name, `uploader · date`, **Preview**
(drawer with `DocumentPreview`), **Download**, **Replace** / **Upload**,
**Delete** (✕ with confirm). "Earlier versions (n)" folds open under the
row. A file can be dropped onto its row. Below `sm`: Preview and Download go
icon-only with accessible names (the buyer-documents rule), every control
44px.

### 4.5 PO page — the Shipping card

`OrderShippingCard` reads shipments instead of BCs: for each shipment holding
this PO — reference (link), the checklist dots, and the current BC's route,
dates and vessel links as today. None: "Not on a shipment yet" with **Add to
shipment** (`shipment.manage`) → a popover listing that buyer's shipments
without a final BL, plus "New shipment" (`/shipments/new?po=…`).

### 4.6 BC page

The **Purchase order** picker (`BookingOrderLink`) becomes **Shipment**:
choose one of the shipments, or **New shipment from this booking** (then pick
the buyer and orders). Gated by `bc.review` as the PO picker was. Everyone
else reads "On shipment SHP-…" as a link.

## 5. The checklist — one pure module

`src/lib/shipments/checklist.ts`, no Prisma, unit-tested:

```ts
type SlotKey = "BOOKING" | ShipmentDocType;
type SlotState = "done" | "missing" | "optional" | "not_needed";
function shipmentChecklist(input: {
  hasBooking: boolean;
  current: Set<ShipmentDocType>;
  formDRequired: boolean;
}): { slots: { key: SlotKey; state: SlotState }[]; requiredDone: number; requiredTotal: number };
```

Required: BOOKING, PACKING_LIST, CUSTOMS_FORM, BILL_OF_LADING, and FORM_D when
required. INVOICE is `optional` until uploaded, then `done`, and never counts
toward the total. Every screen (list dots, shipment header, PO card) reads
this one function, so no two places can count differently (lessons §1).

Dots: green done, ink-tertiary hollow missing, hairline optional/not-needed,
each with its name in `title` and an `aria-label` sentence ("Bill of lading
missing"). Phase 64 adds amber/red for overdue.

## 6. Actions and routes

`src/actions/shipments.ts` — each `requirePermission`, Zod, try/catch,
`{ success, data | error }`:

- `createShipment({ buyerId, purchaseOrderIds, market, formDRequired, note })`
- `updateShipment({ id, market, formDRequired, note })`
- `addOrdersToShipment` / `removeOrderFromShipment` (refuses the last order)
- `linkBookingToShipment({ bookingId, shipmentId | null })` — replaces
  `linkBookingToPurchaseOrder`
- `deleteShipmentDocument({ id })` — current version only
- `deleteShipment({ id })` — only when empty

Routes (an upload needs the browser PUT): `/api/shipments/[id]/documents/presign`,
`…/complete` (HEAD in R2, size and leading bytes, supersede-and-create in one
transaction), `/api/shipments/[id]/documents/[docId]/url` (10-minute presigned
GET, `?download=1` for attachment). All `shipment.view` / `shipment.manage`;
a buyer gets 403, signed out 401.

Every change writes an `AuditEvent` (new actions `SHIPMENT_CREATED`,
`SHIPMENT_UPDATED`, `SHIPMENT_ORDER_ADDED`, `SHIPMENT_ORDER_REMOVED`,
`SHIPMENT_BOOKING_LINKED`, `SHIPMENT_DOC_UPLOADED`, `SHIPMENT_DOC_REPLACED`,
`SHIPMENT_DOC_DELETED`; `detail` holds `shipmentId`, type, file name — never
contents). Phase 64 shows them as the shipment's activity.

The orphan sweep learns the `shipments/` prefix so an object PUT whose
complete never ran is removed after an hour.

## 7. Acceptance criteria

1. A shipment created for Buyer A with two of A's POs shows both on its page
   and on each PO's Shipping card; adding B's PO is refused.
2. The migration turns every BC→PO link into a one-PO shipment: linked BCs
   before = shipments after, and each PO page still shows its vessels.
3. Uploading a packing list turns its dot green on the shipment, the list and
   both PO cards; replacing it keeps the first under "Earlier versions" and
   both download byte-identical.
4. Deleting the current BL empties the slot; history stays; the R2 object of
   the deleted file is gone.
5. Form D defaults on for market "Indonesia" and "Super Indo", off for
   "Vietnam"; toggled off it reads "Not needed" and the count drops by one.
6. Invoice never counts as missing.
7. A member sees shipments and files, no Upload/Delete; a buyer's session gets
   403 on every route and nothing in any shop page.
8. No page overflow at 390 / 768 / 1440 on the list, the shipment (with every
   slot filled and two earlier versions) and the PO page; every control 44px
   below `sm`.
9. Tests, `tsc`, lint, build clean.

## 8. Out of scope here

Overdue rules, filters, dashboard lines and the Delivered warning (Phase 64).
Reading any document with AI (Phase 65). Generating a packing list or
invoice from the PO (not asked). Email (decision 9).
