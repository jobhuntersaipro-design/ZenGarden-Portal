# Phase 16 — Storefront

Branch `feature/storefront`. Depends on: 04 (confirm, the totals gate,
`checkDuplicate`), 05 (the PO list and its `UNION ALL`, the stage stepper),
14 (product images), 15 (client accounts, the shop host, `requireClient`).

Goal: an invited buyer signs in at `shop.lovinghandsportal.com`, browses the
priced catalogue, orders by the carton, and watches their orders move through the
six stages — while ops receives that order in the same queue an emailed PDF lands
in and confirms it through the same gate.

## 0. Why this exists

Every purchase order in the portal arrives the same way: the customer sends a PDF
or a photograph, Claude reads it, a person checks it. That is intake for
documents the customer already wrote.

The customer now wants the other direction — their buyers placing the order
directly, the way they would on Shopee. The order still has to become a
`PurchaseOrder`, still has to pass a human, and still has to feed the same
dashboards. What changes is only where the order is written: a form instead of a
scan.

**This phase does not lower the bar.** A web order lands as a `WebOrder`, joins
the review queue, and becomes a `PurchaseOrder` only when someone confirms it —
through the same totals gate, the same duplicate check and the same
`ORDER_PLACED` stage event as a scanned one.

### Prerequisite: the catalogue must be priced

The shop shows a product only when `active && !needsReview && listPrice > 0`.
On production, 309 products currently sit at `listPrice 0.00` with
`needsReview: true`, so **the shop would open nearly empty**. Pricing the
catalogue is a blocker on this phase, not a follow-up. `/products` gains a
super-admin line — *"N products are not visible in the shop"* — so the gap is a
number somebody can watch fall rather than a surprise on launch day.

One consequence worth stating, because it will surprise someone: `updateProduct`
sets `needsReview: false` on **any** save (`src/actions/products.ts:138`), so
correcting a typo on an unpriced product publishes it to the shop the moment a
price exists.

## 1. Data model

```prisma
model WebOrder {
  id              String         @id @default(cuid())
  /** Postgres serial. The only source of `reference`; gaps are fine. */
  seq             Int            @default(autoincrement())
  reference       String         @unique
  buyerId         String
  buyer           Buyer          @relation(fields: [buyerId], references: [id])
  placedById      String
  placedBy        User           @relation("webOrdersPlaced", fields: [placedById], references: [id])
  status          WebOrderStatus @default(DRAFT)
  /** The client's own PO number, if they have one. → PurchaseOrder.buyerReference. */
  buyerReference  String?
  requestedDate   DateTime?      @db.Date
  notes           String?
  currency        String         @default("MYR")
  /** Snapshotted at submit. Zero while DRAFT — the cart's total is computed. */
  subtotal        Decimal        @default(0) @db.Decimal(14, 2)
  submittedAt     DateTime?
  reviewedById    String?
  reviewedBy      User?          @relation("webOrdersReviewed", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  declinedReason  String?
  purchaseOrderId String?        @unique
  purchaseOrder   PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id])
  lines           WebOrderLine[]
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  @@index([status, submittedAt])
  @@index([buyerId, submittedAt])
}

enum WebOrderStatus { DRAFT  SUBMITTED  CONFIRMED  DECLINED }

model WebOrderLine {
  id         String   @id @default(cuid())
  webOrderId String
  webOrder   WebOrder @relation(fields: [webOrderId], references: [id], onDelete: Cascade)
  productId  String
  product    Product  @relation(fields: [productId], references: [id])
  cartons    Int
  /** All four snapshotted at submit; zero while DRAFT. */
  packSize   Int?
  unit       String   @default("carton")
  unitPrice  Decimal  @default(0) @db.Decimal(14, 4)
  amount     Decimal  @default(0) @db.Decimal(14, 2)
  @@unique([webOrderId, productId])
  @@index([productId])
}
```

Three shape decisions worth their reasons:

- **`@@unique([webOrderId, productId])`** makes *add to cart* a one-line `upsert`
  and makes adding the same product twice harmless rather than a duplicate row.
- **No `position`.** A cart has no meaningful order, and a positional unique
  constraint would force the shift-everything-out-of-the-way dance
  `reorderImages` performs (`src/actions/products.ts:186-193`) on every removal.
  `LineItem.position` is assigned at confirm.
- **`purchaseOrderId` lives on `WebOrder`**, so `PurchaseOrder` gains only a
  back-relation and no column of its own.

One open cart per client, in raw SQL because Prisma 7 cannot express a partial
index:

```sql
CREATE UNIQUE INDEX "WebOrder_one_draft_per_user"
  ON "WebOrder" ("placedById") WHERE "status" = 'DRAFT';
```

## 2. `PurchaseOrder.documentId` becomes nullable

A web order has no document. `PurchaseOrder.documentId` is required today
because until now every PO came from a scan.

```sql
ALTER TABLE "PurchaseOrder" ALTER COLUMN "documentId" DROP NOT NULL;
```

`@unique` on a nullable column still enforces one PO per document — Postgres
permits many NULLs — so nothing is lost.

**The alternative was to synthesise a fake `Document` and `Extraction`,** which
would need a unique `r2Key` naming an object that does not exist. Then
`DocumentPreview` and `Download original` render a pane that can only fail,
`/api/documents/[documentId]/url` presigns a GET for nothing, and
`deleteOrphans()` starts reasoning about rows that describe no file. You pay the
special-casing cost anyway *and* keep a lie in the table.

> ⚠️ **The silent regression this creates.** `src/lib/queries/po-list.sql.ts:208-209`
> are **inner** joins:
>
> ```sql
> JOIN "Document" doc  ON doc."id" = po."documentId"
> JOIN "User" uploader ON uploader."id" = doc."uploadedById"
> ```
>
> The moment `documentId` can be null, every PO confirmed from a web order
> **disappears** — from `/purchase-orders`, from its money summary line, from the
> "Needs review" count, and from the PO table on `/buyers/[id]`. No error, no
> type failure, nothing in a log. The first symptom is ops saying *"I confirmed
> it and it's gone."*
>
> Both become `LEFT JOIN`, with `COALESCE(doc."mimeType", 'web')` for `fileType`,
> **in the same commit as the migration**. `filters.uploadedById` then correctly
> excludes web orders, which is intended and gets a comment saying so.
> `src/lib/queries/po-list.sql.test.ts` is new and exists specifically for this:
> a type checker cannot catch it and no other test would.

## 3. The cart is the `DRAFT` row, and it never stores a price

The client is always signed in, so there is no anonymous cart to merge and no
reason to reach for `localStorage`.

The decisive argument is pricing. **The cart stores `productId` and `cartons` and
nothing else.** `src/lib/queries/cart.ts` joins `Product` on every read, so the
price on screen is always today's `listPrice` — a stale price is not merely
unlikely, it is unrepresentable. `submitWebOrder` then snapshots `unitPrice`,
`packSize`, `unit`, `amount` and `subtotal` **inside the transaction**, so the
order records what the client actually agreed to and the reviewer sees the same
figures they saw.

A cookie cart would carry last Tuesday's price, and a 4KB cookie will not hold a
forty-line B2B order anyway.

**One model, not a separate `Cart`.** Two structurally identical models is the
duplication this codebase avoids, and keeping one means the submitted order
survives as the client's own receipt, linking to the `PurchaseOrder` it became.
The risk it creates — a half-built cart leaking into the ops queue — is closed
by two rules: every ops-side read goes through `src/lib/queries/web-orders.ts`,
and the SQL branch in §5 **hardcodes** `wo."status" = 'SUBMITTED'` rather than
taking the status as a parameter.

Quantity changes are a Server Action round trip, so the stepper uses
`useOptimistic` with a ~400 ms debounce, following the pending vocabulary already
established in `src/hooks/usePendingChoice.ts` and `src/components/portal/Spinner.tsx`.

## 4. Cartons, and why there is no conversion

`Product.unit` is already `"carton"` and `listPrice` is already **per carton** —
`src/lib/catalog-import.ts:37,309` and every row in `prisma/seed/products.ts`.
`packSize` is pieces per carton.

So the client's cartons **are** `LineItem.quantity`, and `listPrice` **is**
`unitPrice`. There is no unit conversion anywhere in this phase, and
`src/lib/cartons.ts` is a pure display module: given `packSize` and `cartons`, it
returns the piece count and the caption. A product with no `packSize` falls back
to showing its `unit` alone.

Money arithmetic goes through the existing `lineAmount()`
(`src/lib/validation/purchase-orders.ts:136`), never float multiplication.

## 5. Ops intake

### The list

`po-list.sql.ts` gains a **third union branch** beside `poRows` and `draftRows`:

```
kind        'WEB'
poNumber    wo."reference"
buyerName   buyer."name"        -- unlike a draft, a web order has a real buyer
poDate      NULL::date
itemCount   count of WebOrderLine
total       wo."subtotal"
status      'NEEDS_REVIEW'
stage       NULL
sortStatus  0                   -- sorts with the backlog, above confirmed rows
WHERE       wo."status" = 'SUBMITTED'
```

- `PoListRow["kind"]` → `"PO" | "DRAFT" | "WEB"`; `PoListFilters["status"]` gains
  `"web"`; `PoFilters` gains a **From the shop** chip.
- `filters.buyerId` **is** honoured here — a web order has a buyer, so unlike
  `draftRows:238` it does not push `FALSE`. `from`, `to` and `stage` do push
  `FALSE`, for the same reason a draft does: there is no PO date and no stage
  yet.
- `q` searches the reference, the buyer name and the product names on the lines.
- `poListNeedsReviewQuery` counts web orders, so the chip and the rows it filters
  to still agree — the master spec's rule that *a number and the table under it
  must agree*.
- `PoTable.rowHref` sends `kind === "WEB"` to `/web-orders/{id}`; `FILE_LABEL`
  gains `web: "WEB"`; the actions column shows nothing, since there is no upload
  to delete.
- The **Uploaded by** column renders *From the shop* rather than blank, and
  `listFilterOptions()` (`src/lib/queries/purchase-orders.ts:50`) still builds its
  select from users who have documents — so the filter excludes web orders, which
  is correct and would otherwise read as a bug.

### Dashboard and buyer detail

`IntakeCounts` gains `webOrders`. `WorkQueue` adds a third job —
*"3 web orders to confirm"* → `/purchase-orders?status=web`, toned
`INTAKE_STATUS.NEEDS_REVIEW` — and its link carries **no date range**, exactly
like the two jobs already there: a web order has no PO date, so a ranged link
lands on an empty table. That is the defect recorded against the intake links in
the 2026-09-06 UI-change brief and it must not be reintroduced. The queue still
renders nothing when there is nothing to do.

`loadBuyer` counts the buyer's submitted web orders into its existing
`Promise.all`, and `/buyers/[id]`'s `StatusBar` gains a segment.

### Email

`src/emails/WebOrderPlaced.tsx` + `webOrderPlacedSubject(buyerName)`, to every
active `MEMBER` **and** `SUPER_ADMIN`. Note this is wider than
`queueAccessRequest` (`src/lib/auth-access.ts:105-108`), which mails super admins
only — an order is work for whoever is on the queue, not a decision for an
administrator.

Sent through `sendEmail`, which never throws by design, inside `after()` so the
client's submit does not wait on a Resend round trip.

## 6. Confirm — one writer, two callers

`confirmPurchaseOrder` is documented as *"the only path that writes a
PurchaseOrder"* and that stays true. Lines 261-323 of
`src/actions/purchase-orders.ts` are extracted into a **private** helper in the
same file:

```ts
async function writePurchaseOrder(
  tx: Prisma.TransactionClient,
  input: {
    data: PoDraft; buyerId: string; documentId: string | null;
    confirmedById: string; revision: number; revisionOfId: string | null;
    productIds: (string | null)[]; totalsAcknowledged: boolean;
    buyerReference?: string | null;
  },
): Promise<string>;
```

`confirmPurchaseOrder` keeps its **exact public signature** — `ReviewForm`,
`confirm.test.ts` and `purchase-orders.test.ts` are untouched — and passes
`documentId: extraction.documentId`. `confirmWebOrder` passes `null`.

This is deliberately the smallest possible change to that function, because
Phase 12 is rewriting its product resolution and a larger refactor would collide
head-on.

`confirmWebOrder(webOrderId, draft, options)` in `src/actions/web-orders.ts`:
`requireUser()`, `PoDraftSchema`, `checkTotals`, then one transaction —
re-read the `WebOrder` and throw `ALREADY_CONFIRMED` unless it is still
`SUBMITTED`; `writePurchaseOrder(tx, { …, documentId: null, buyerReference })`;
set `status: CONFIRMED`, `purchaseOrderId`, `reviewedById`, `reviewedAt`. Same
`ActionResult` shape, same P2002 message.

`declineWebOrder(webOrderId, reason)` requires the reason, sets `DECLINED`, and
emails the client. An order nobody can accept has to be closable, or the queue
grows rows nobody can clear.

### The PO number

`W-{yy}{mm}-{seq5}` → `W-2609-00007`, from `src/lib/web-order-number.ts` (pure,
tested, beside `src/lib/sku.ts`). Uniqueness comes from the Postgres serial, so
there is no counter table and no locking; the `yymm` is readability only, taken
in Kuala Lumpur time like every other date in the portal.

It is the **default** for `poNumber` at confirm, not a fixed value — ops types
over it with the customer's own number when there is one, and
`checkDuplicate(buyerId, poNumber)` runs exactly as it does on `/review/[id]`.
The client's own reference goes to `PurchaseOrder.buyerReference`, a column that
already exists and is written by nothing today.

### Deleting a confirmed web order

`deletePurchaseOrder` (`src/actions/purchase-orders.ts:463-482`) passes
`documentId` into `extraction.updateMany`; a null becomes `IS NULL` and matches
nothing. Guard it, and in the same transaction set the linked `WebOrder` back to
`SUBMITTED` — the mirror of the extraction going back to `SUCCEEDED`, so a
deleted order returns to the queue instead of stranding the web order in
`CONFIRMED` pointing at a row that no longer exists.

## 7. The ops review screen is not `/review/[id]`

`/review/[id]` is document-driven: a PDF pane, an 800 ms debounced `saveDraft`,
an extraction queue, `RunningPoller`. A web order has no document, no extraction,
no `draftJson` and no queue — and its buyer is known and its lines already carry
a `productId`, so the hardest parts of `ReviewForm` have nothing to do.

`/web-orders/[id]` mirrors that screen's two-pane geometry, so it reads as the
same job:

- **Left — `SubmittedOrderPane`, read-only.** What the client sent, playing the
  role the PDF plays: the thing you check the form against. Buyer, the contact
  and their email, their reference, requested date, notes, and each line as
  `12 cartons · 72 pieces · RM 189.00 · RM 2,268.00`, with the subtotal and
  *Placed by Siti Aminah on 9 Sep 2026*.
- **Right — `WebOrderReviewForm`.** PO number (defaulting to `reference`), PO
  date, payment terms (defaulting to `Buyer.paymentTerms`), tax, remark, and a
  lines table where quantity and unit price are editable and the product is
  fixed. Reuses `checkTotals()`, `lineAmount()` and `checkDuplicate()` unchanged,
  so the totals gate behaves identically.
- Actions: **Confirm order**, and **Decline** with a required reason.

Built standalone rather than by extracting a shared editor out of `ReviewForm`.
It genuinely needs less, and Phase 12 is rewriting `ReviewForm`; a shared
extraction would collide with it.

## 8. The storefront

Real paths under `/shop`, rewritten from the shop host by the proxy Phase 15
built. Every `<Link>` is written browser-relative and every `revalidatePath`
names the real path — both through `src/lib/shop-routes.ts`, never by hand.

| Route (as the client sees it) | File |
|---|---|
| `/` — catalogue | `src/app/(storefront)/shop/page.tsx` |
| `/products/{id}` | `…/shop/products/[id]/page.tsx` |
| `/cart` | `…/shop/cart/page.tsx` |
| `/orders`, `/orders/{id}` | `…/shop/orders/…` |

`layout.tsx` calls `requireClient()` once, so every page below may assume a
buyer. Its own shell — `ShopHeader` with the wordmark, a search field, a cart
count and an account menu — not the ops sidebar, which is a different product.

**Catalogue.** Grid of `ShopProductCard` (image via `ProductThumb`, name, brand ·
variant, `12 per carton`, price per carton, a `CartonStepper`), filtered by
category and brand with `SegmentGroup`, searched by name, brand and variant,
paginated server-side through the existing `TablePagination`. Two-up on a phone,
as `/products` already is.

**Product page.** `ProductGallery` — the same component the ops product page
uses, and the reason Phase 14 comes first — description, pack size, price, and
the stepper.

**Orders.** Every `PurchaseOrder` for the client's buyer, including ones ops
keyed from an emailed PDF, plus their own `SUBMITTED` and `DECLINED` web orders
so nothing they did vanishes. Detail shows the lines and the live stage through
the existing `StageStepper` and `src/lib/po-stages.ts`.

> ⚠️ **What the client must never see.** `PurchaseOrder.notes` is a free ops
> remark. `PoStageEvent.note` carries internal reasons. `confirmPurchaseOrder`
> writes the totals-mismatch acknowledgement into a stage event **verbatim**
> (`purchase-orders.ts:316-320`). And `confirmedBy` / `changedBy` name and
> photograph the ops team.
>
> `listBuyerOrders` in `src/lib/queries/web-orders.ts` is therefore an explicit,
> narrow `select` — PO number, PO date, stage, `stageChangedAt`, totals, and line
> description / quantity / unitPrice / amount — and **never** a `findMany` with
> `include`. An `include` is what turns a schema change months from now into a
> leak.

Two other hardening items belong in this phase, because it is the phase where a
non-employee first reads order data:

- **`/api/documents/[documentId]/url`** presigns a GET for *any* document for any
  caller passing `requireUser()`. Clients cannot reach it after Phase 15, but
  scope it to the document's own purchase order rather than leaving the hole
  behind a role check.
- **Rate-limit `submitWebOrder`.** `src/lib/rate-limit.ts` covers sign-in and
  password reset only. Cap open `SUBMITTED` orders per buyer and refuse a second
  submit within ~30 s, in plain language.

## 9. Tests

Pure modules first, since they carry the arithmetic:

| Module | Cases |
|---|---|
| `src/lib/cartons.ts` | `packSize 6, cartons 12` → 72 pieces and the caption; `packSize null` falls back to `unit`; amounts computed through `lineAmount`, never float |
| `src/lib/web-order-number.ts` | zero-padding; a 2026-10-01 00:30 KL instant yields `2610`, not `2609` |

Then the actions, following `src/actions/confirm.test.ts` (mock `@/lib/prisma`
with a `tx`; mock `@/lib/auth-guards` outright, since the real module pulls
`next-auth` → `next/server`):

- **`cart`** — adding the same product twice yields one line; an inactive,
  `needsReview` or unpriced product is refused; `cartons <= 0` and above the cap
  are refused; a caller can only touch their own `DRAFT`.
- **`web-orders`** — `submitWebOrder` snapshots today's price into every line and
  flips `DRAFT → SUBMITTED` in one transaction; an empty cart is refused; a
  second submit says so.
- **`confirm-web-order`** — the mirror of `confirm.test.ts`: writes a
  `PurchaseOrder` with `documentId: null`, links `purchaseOrderId`, writes the
  `ORDER_PLACED` event with `changedById: null`, applies the totals gate both
  ways, refuses an already-`CONFIRMED` order.
- **`po-list.sql`** — new, and the reason it exists is §2: assert the generated
  `Prisma.Sql` contains `LEFT JOIN "Document"`, and that `status: "web"` yields
  only the web branch.
- **`listBuyerOrders`** — asserts the projection contains no `notes`, no stage
  note and no person.

## 10. Acceptance criteria

1. A client signs in on the shop host and sees only priced, active, reviewed
   products — an unpriced product is absent, and no page anywhere exposes one.
2. Adding three products by the carton shows the right derived piece counts and a
   subtotal that matches the lines.
3. A price changed in ops between adding and submitting is the price the client
   sees before they submit, and the price snapshotted on the submitted order.
4. Submitting produces the ops email and a `WorkQueue` entry, and the order
   appears in `/purchase-orders` under **From the shop** with the buyer's name.
5. Confirming it with an edited quantity writes a `PurchaseOrder`, and that PO
   appears in the PO list, in its money summary, in the buyer's PO table and on
   the buyer detail page. **This is the LEFT JOIN regression and it is invisible
   unless looked for.**
6. Advancing the stage in ops moves the stage on the client's order page.
7. Declining an order with a reason reaches the client and closes the queue row.
8. No ops remark, stage note, ops name or ops avatar appears anywhere on the
   shop.
9. A client cannot reach another buyer's order by guessing an id.
10. Deleting a confirmed web-order PO returns the web order to the queue.
11. Every existing ops journey is unchanged, including a scanned PO confirmed
    through `/review/[id]`.
12. No horizontal page overflow at 390px, 768px and 1440px on every shop route.

## 11. Out of scope

- **Online payment.** These are B2B orders on payment terms; the invoice follows
  the delivery. Nothing in this phase touches money movement.
- **Stock or availability.** `Product` has no stock field and the customer does
  not track one here. Ops confirms what can be supplied, which is what the review
  screen is for.
- **Per-buyer pricing.** One `listPrice` for everyone; a negotiated price is
  applied by ops when confirming, as it already can be. A `BuyerPrice` table is
  a phase of its own if it is ever asked for.
- **Client self-registration.** Ops decides who sees trade prices (Phase 15 §8).
- **Reordering from a past order.** An obvious next feature and a small one once
  this exists; deliberately not in the first cut.
- **A public or SEO surface.** The shop is sign-in-only end to end, so there is
  no marketing page, no metadata work and no crawler to serve.
- **Order editing after submit.** The client submits; ops edits at review or
  declines. A `DRAFT ↔ SUBMITTED` round trip is a harder state machine than the
  first version needs.
- **Notifying the client on every stage move.** They can see it. Email per stage
  is six emails an order and nobody has asked.
