# Phase 19 — The purchase order document

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The moment a client sends an order, an A4 purchase order is generated, stored in R2 and filed as a `Document`; the client can list, read and download their purchase orders with the live stage above each; and when ops confirms, the `PurchaseOrder` carries that document like a scanned one does.

**Architecture:** `@react-pdf/renderer` draws the artboard's A4 from a typed `PoDocumentData` built by one function; `attachWebOrderDocument` renders it, writes the `Document` row and the R2 object, and links `WebOrder.documentId`. `confirmWebOrder` passes that id to `writePurchaseOrder`, closing the `documentId: null` gap Phase 16 opened. A client-scoped URL route serves the bytes; the ops routes are untouched.

**Tech Stack:** `@react-pdf/renderer` (new dependency), bundled OFL TTFs for Inter, Plus Jakarta Sans and Sometype Mono, `outputFileTracingIncludes`, R2 `PutObject`, `react-pdf` (already installed) for the viewer.

**Spec:** this file, `00-overview.md`, artboard `PurchaseOrderDoc` (also `purchase-order-preview.html`), the prototype's *Purchase orders* list and *purchase order* views, `OrderPlaced`. Read `16-storefront.md` §2 (the LEFT JOIN) and `src/lib/queries/documents.ts` (`deleteOrphans`) before touching anything.

**Branch:** `feature/shop-po-document`. Depends on 18.

## Global constraints

- Phase 17's, unchanged.
- Money on the document is `Prisma.Decimal` through `lineTotal`/`sumDecimals`, formatted once; the document's total must equal the `WebOrder.subtotal` snapshot to the cent, and the test asserts it.
- The PDF is generated **after** the order is committed and its failure never undoes the order.
- A `Document` created here has no `Extraction` and must survive `deleteOrphans`.
- Client reads of a document are scoped by `buyerId` in the query, never by comparing afterwards.
- The ops document routes keep `requireUser()`; clients get their own route.

---

## 0. Why this exists

A shop order today has nothing behind it. `documentId` is null, the ops PO detail says "Placed on the shop, so there is no document", and the buyer has nothing to file. The canvas fixes both with one artefact: a purchase order in the buyer's own name, produced by the seller's system at the moment the buyer sends the order, that the buyer downloads and the ops team sees attached to the confirmed PO. When they phone each other, they are looking at the same page.

## 1. Data model

```prisma
model WebOrder {
  // …
  /// The purchase order generated at send (Phase 19). Null only if generation
  /// failed; `regenerateWebOrderDocument` fills it in. Becomes
  /// PurchaseOrder.documentId at confirm.
  documentId String?   @unique
  document   Document? @relation(fields: [documentId], references: [id])
}
model Document {
  // …
  webOrder WebOrder?
}
```

Migration `20260912100000_web_order_document`: `ADD COLUMN "documentId" TEXT`, unique index, FK `ON DELETE SET NULL`.

> ⚠️ **`deleteOrphans` will delete these documents unless told otherwise.** It sweeps `Document` rows with `extraction: null` and `purchaseOrder: null` older than an hour — which describes every generated purchase order from the moment it is written until ops confirms, days later. Add `webOrder: null` to that `where` **in the same commit as the migration**, and add the test that asserts it. Nothing else would catch this; the sweep runs on one presign in twenty and logs a count nobody reads.

`Document.uploadedById` is the client who sent the order (a `User`, so the relation holds). Two ops surfaces read that column and need one line each: the PO list's *Uploaded by* column already prints *From the shop* for a web row and must keep doing so once the row has a document (§4); and `listFilterOptions()` (`src/lib/queries/purchase-orders.ts`) builds the uploader filter from users who have documents — add `role: { not: Role.CLIENT }` so a buyer's contact never appears in an ops filter.

## 2. Environment

`SUPPLIER_REGISTRATION_NO`, `SUPPLIER_TAX_LABEL`, `SUPPLIER_TAX_RATE` (`z.coerce.number().min(0).max(100)`), all optional, beside Phase 17's four. The tax row prints only when both label and rate are set.

## 3. The document

### 3.1 Data

```ts
// src/lib/po-document/data.ts
export type PoDocumentLine = {
  n: number;
  /** What prints in the Product code column: the buyer's own code once Phase 22 exists, our SKU until then. */
  code: string;
  /** "Our ref ZEN-SC-2100-GM-VN" beneath a buyer's code; null when `code` already is our SKU. */
  ourRef: string | null;
  name: string;
  packLine: string;          // "6 per carton · 18 pieces"; "per carton" when packSize is null
  cartons: number;
  unitPrice: string;         // "225.50"
  amount: string;            // "676.50"
};

export type PoDocumentData = {
  reference: string;                       // W-2609-00007
  number: string;                          // buyerReference ?? reference — the masthead
  orderDate: string;                       // formatDate(submittedAt)
  requestedDate: string | null;
  paymentTerms: string | null;             // Buyer.paymentTerms
  buyer: { name: string; address: string | null; contactName: string | null; email: string | null };
  supplier: { name: string; registrationNo: string | null; address: string | null; email: string | null; phone: string | null };
  lines: PoDocumentLine[];
  subtotal: string;
  tax: { label: string; amount: string } | null;
  total: string;
  notes: string | null;
  generatedAt: string;                     // "10 Sep 2026, 14:32 (GMT+8)"
};

/** Pure: the shape the renderer and the tests share. */
export function buildPoDocumentData(order: PoDocumentSource, supplier: SupplierDetails, now: Date): PoDocumentData;
/** The one query behind it, scoped to nothing — callers have already checked ownership. */
export async function loadPoDocumentSource(webOrderId: string): Promise<PoDocumentSource | null>;
export const poDocumentFileName = (reference: string) => `${reference} purchase order.pdf`;
```

`PoDocumentSource` is the narrow select: the order's reference, `buyerReference`, `submittedAt`, `requestedDate`, `notes`, `subtotal`, the buyer's four fields and `paymentTerms`, and each line's `cartons`, `packSize`, `unitPrice`, `amount` and `product.{name, sku}`. Lines sort by name. `tax.amount = subtotal × rate / 100` rounded half-up to 2 dp through `Prisma.Decimal`; `total = subtotal + tax`. **`total` must equal `WebOrder.subtotal` when no tax is configured** — asserted.

`SupplierDetails` comes from `env` through `supplierDetails()` in `src/lib/supplier.ts` (Phase 17's four keys plus this phase's three), so the footer, the menu and the document read one function.

### 3.2 Rendering

`src/lib/po-document/render.tsx`:

```ts
export async function renderPoDocument(data: PoDocumentData): Promise<Uint8Array>;   // renderToBuffer(<PurchaseOrderPdf data={data} />)
```

`PurchaseOrderPdf` is the artboard in `@react-pdf/renderer` primitives (`Document`, `Page size="A4"`, `View`, `Text`), 48pt page padding, the masthead with the wordmark in two `Text` runs (gradient text is not available in PDF; *Loving* prints in `#7612fa` — the brand purple as **text**, which the design system permits — and *Hands* in ink), **PURCHASE ORDER** and the number; the four-cell meta strip; Buyer / Supplier; the line grid `34 / 132 / 1fr / 64 / 96 / 104` pt; totals right-aligned in a 300pt column; *Notes from the buyer* (`—` when none); the two signature rules; the footer line "Generated by Loving Hands on {generatedAt}" and the reference. Colours are the seven hex values from `_parts.md` declared once in `render.tsx` as a `PDF_COLORS` map — the one file in the repository allowed raw hex, because a PDF has no stylesheet; say so in its header comment.

**Fonts.** `Font.register` for Inter 400/500/600, Plus Jakarta Sans 700, Sometype Mono 500 from TTFs in `src/lib/po-document/fonts/` (all OFL; note the licence file beside them), resolved with `path.join(process.cwd(), "src/lib/po-document/fonts", file)`. `next.config.ts` gains

```ts
outputFileTracingIncludes: {
  ...sharp,
  "/shop/**": ["./src/lib/po-document/fonts/**"],
  "/api/shop/**": ["./src/lib/po-document/fonts/**"],
}
```

— a **glob** key, per the 2026-09-09 `[id]` lesson. And because that lesson also says a laptop build cannot prove the include worked, a probe route ships with it: `GET /api/shop/documents/probe` (`requireUser()` — staff only, no data) renders a one-line PDF and answers `{ bytes }`; a 500 with Next's HTML page means a font failed to load in production. Run it after the deploy, as the sharp probe was.

### 3.3 Generating and storing

```ts
// src/lib/po-document/attach.ts
/**
 * Render, store, link. Idempotent: an order that already has a document
 * returns it. Never called inside the order's transaction — R2 is not a
 * participant — and never allowed to fail the send: the caller catches.
 */
export async function attachWebOrderDocument(webOrderId: string): Promise<{ documentId: string } | null>;
```

Steps: load the source (status `SUBMITTED` or `CONFIRMED`, else null) → `buildPoDocumentData` → `renderPoDocument` → `prisma.document.create({ uploadedById: placedById, originalName: poDocumentFileName(reference), mimeType: "application/pdf", sizeBytes: bytes.length, r2Key: \`${PENDING_KEY_PREFIX}${randomUUID()}\` })` → `putObject(documentKey(document.id, "pdf"), bytes, "application/pdf")` (new in `r2.ts`) → `document.update({ r2Key })` and `webOrder.update({ documentId })` in one `$transaction`. If the put throws, delete the row and return null.

`submitWebOrder`: after its transaction and before `revalidateShop()`:

```ts
try { await attachWebOrderDocument(webOrderId); }
catch (cause) { console.error("[cart] purchase order document", cause); }
```

(`submitWebOrder`'s transaction must now return the order's `id` as well as `reference`.)

`regenerateWebOrderDocument(webOrderId)` in `src/actions/web-orders-client.ts` (`requireClient`, the order must belong to the caller's buyer): calls `attachWebOrderDocument`, revalidates the sent page, the PO list and `/orders`. The sent page and the PO list offer it where `documentId` is null.

### 3.4 Confirm and delete

`confirmWebOrder` selects `documentId` and passes `documentId: order.documentId` to `writePurchaseOrder`. `deletePurchaseOrder` needs nothing new: the extraction `updateMany` matches no row, the `WebOrder` returns to `SUBMITTED` as Phase 16 built, and the document stays linked to the web order for the next confirm.

The ops PO detail page's document section heading reads *Purchase order — generated on the shop* when `po.webOrder` exists (one conditional), and `DocumentPreview` renders the PDF as it does a scan.

## 4. The purchase-order list knows the source

`po-list.sql.ts`: every branch gains `source` — `'web'` in the web branch, `'scan'` in the draft branch, and in `poRows`

```sql
CASE WHEN EXISTS (SELECT 1 FROM "WebOrder" wo WHERE wo."purchaseOrderId" = po."id") THEN 'web' ELSE 'scan' END AS "source"
```

`PoListRow.source: "web" | "scan"`. `PoTable`: the file chip shows `FILE_LABEL[fileType]` (now *PDF* for a confirmed shop order) **and** a *WEB* chip when `source === "web"`; *Uploaded by* prints *From the shop* on `source === "web"` rather than on a missing document. `po-list.sql.test.ts` asserts the `"source"` alias appears in each branch.

## 5. Client routes

| Browser path | File |
|---|---|
| `/purchase-orders` | `src/app/(storefront)/shop/purchase-orders/page.tsx` |
| `/purchase-orders/[id]` | `…/purchase-orders/[id]/page.tsx` |
| `GET /api/shop/documents/[documentId]/url` | `src/app/api/shop/documents/[documentId]/url/route.ts` |
| `GET /api/shop/documents/probe` | `src/app/api/shop/documents/probe/route.ts` |

`shopHref.purchaseOrders()`, `shopHref.purchaseOrder(id)`, `shopApi.documentUrl(documentId, { download?, redirect? })` (a third export in `shop-routes.ts`; `/api/*` is shared across hosts and never rewritten, so it is written literally). `SHOP_PRIVATE_PATHS` gains `"/purchase-orders"`.

### 5.1 The URL route

`requireClient()`; then

```ts
const document = await prisma.document.findFirst({
  where: {
    id: documentId,
    OR: [{ webOrder: { buyerId } }, { purchaseOrder: { buyerId, supersededBy: null } }],
  },
  select: { r2Key: true, mimeType: true, originalName: true },
});
```

A miss or a pending key is 404. `?download=1` pins the filename. `?redirect=1` answers **302** to the presigned URL instead of JSON, so *Download PDF* can be a plain `<a>` and the list rows can `target="_blank"`. The route's header comment restates why it exists beside the ops one (the hazard recorded in `/api/documents/[documentId]/url/route.ts`).

`DocumentPreview` / `DocumentPreviewLoader` gain `urlPath?: (documentId: string) => string`, default the ops route; the shop passes `shopApi.documentUrl`.

### 5.2 The list — `/purchase-orders`

```ts
// src/lib/queries/client-documents.ts
export type ClientPurchaseOrderRow = {
  id: string;                       // WebOrder id, or PurchaseOrder id for a scanned PO
  documentId: string | null;
  fileName: string;
  meta: string;                     // "PDF · generated 10 Sep 2026" | "PDF · received 22 Aug 2026" | "Being prepared"
  buyerReference: string | null;
  date: Date;
  productCount: number;
  total: string;
  stage: PoStage | null;            // null: submitted, awaiting confirm
  declined: boolean;
};
export async function listClientPurchaseOrders(buyerId: string, page: number, perPage: number): Promise<{ rows: ClientPurchaseOrderRow[]; total: number }>;
```

Sources, merged and sorted by date desc like `listBuyerOrders`: web orders with status `SUBMITTED`/`CONFIRMED` (date `submittedAt`, total from the confirmed PO when present else `subtotal`, stage from the PO) — and confirmed, non-superseded purchase orders with a document and **no** web order (date `poDate`, `originalName`, "received"). Narrow selects; the test asserts no `notes`, no reviewer, no `confirmedBy`.

Screen: `h1` **Purchase orders**, the paragraph from the canvas; a `rounded-lg border-hairline` table with a `bg-surface` header (Document · Your PO number · Order date · Products · Total · Stage) — each row an `<a target="_blank" rel="noopener">` to `/purchase-orders/{id}`: a 36px `rounded-sm bg-focus`… a flat purple tile is forbidden; use `bg-ink` with a mono *PDF* label; file name and meta; the mono buyer reference (`—` in `ink-disabled`); date; count; total; an 8px stage dot (`stageColorVar`) and label — *With the team* when null, *Not accepted* when declined; the external-link glyph. Below `md` the row is a card. Footer caption: "Opening a purchase order opens it in a new tab, so you keep this list where it is. Anything you have uploaded yourself lives under Settings → Documents." (the second sentence lands with Phase 21; ship it without until then). A row whose document is still null shows *Prepare the PDF* (calls `regenerateWebOrderDocument`) in place of the link. `TablePagination` at 20.

### 5.3 The viewer — `/purchase-orders/[id]`

`loadClientPurchaseOrder(buyerId, id)` → `{ fileName, documentId, reference, buyerReference, stage, events: ClientStageEvent[], total, declined }` or null (id tried as a `WebOrder` first, then a `PurchaseOrder`, both `where buyerId`). Page:

- **Dark bar** `bg-ink text-canvas` full width, page-width row: the external glyph, the file name `body-sm font-semibold`, "opened in a new tab" caption, **Download PDF** white pill (`h-control-sm rounded-pill bg-canvas text-ink`) as `<a href={shopApi.documentUrl(documentId, { download: true, redirect: true })}>`, and a × button (`CloseTab`, client): `window.close()`; if the tab is still open 150 ms later (the page was opened directly), `router.push(shopHref.purchaseOrders())`.
- **White band**: "Order {reference} · your ref {buyerReference}" caption, the stage label as `h1` `heading-md` (*With the team* / *Not accepted*), the total on the right, and `StageStepper current={stage} events={events}` (`changedByName` forced null as in `loadBuyerOrder`).
- **Body** `bg-surface-soft py-2xl`: `DocumentPreview` with the shop `urlPath`, centred, `max-w-[794px]` → add `--container-a4: 794px` to `@theme` (the one new token this phase). A null `documentId` shows the *Prepare the PDF* card instead.

### 5.4 Order sent, the receipt, the menu

The sent page gains **Download purchase order (PDF)** as the leading pill (`shopApi.documentUrl(…, { download, redirect })`) with *Track this order* outlined beside it; while `documentId` is null it shows *Prepare the PDF* → `regenerateWebOrderDocument`. The receipt email gains **Download your purchase order** → `${SHOP_URL}/purchase-orders/{id}`. The account menu gains **Purchase orders** after *My orders*.

---

## 6. Tasks

### Task 1: Schema, migration and the orphan sweep

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260912100000_web_order_document/migration.sql`, `src/lib/queries/documents.ts`, `src/lib/queries/documents.test.ts` (new), `src/lib/queries/purchase-orders.ts` (`listFilterOptions` excludes clients)

- [ ] Failing test: `deleteOrphans` calls `document.findMany` with a `where` containing `webOrder: null` beside `extraction: null` and `purchaseOrder: null` (assert the object by equality).
- [ ] Write the schema and migration; `timeout 120 npx prisma migrate deploy`; `npx prisma generate`; `migrate status` clean.
- [ ] Implement; PASS. Commit `feat(db): a web order carries its generated document, and the orphan sweep leaves it alone`

### Task 2: Supplier details and the document data

**Files:** `src/lib/env.ts`, `.env.example`, `src/lib/supplier.ts`, `src/lib/po-document/data.ts`, `src/lib/po-document/data.test.ts`

- [ ] Failing tests:

```ts
it("prints our SKU as the code with no our-ref line until aliases exist", …)      // code === sku, ourRef === null
it("totals the lines through Decimal and equals the snapshot", () => {
  const data = buildPoDocumentData(sourceWith([{ cartons: 3, unitPrice: "225.50" }, { cartons: 2, unitPrice: "79.20" }]), NO_TAX, now);
  expect(data.subtotal).toBe("835.10"); expect(data.total).toBe("835.10"); expect(data.tax).toBeNull();
});
it("adds a tax row when both label and rate are set, rounding half-up", …)         // 835.10 × 8% = 66.808 → "66.81", total "901.91"
it("masthead number is the buyer's reference when they gave one", …)
it("packLine drops the pieces when packSize is null", …)
it("generatedAt is Kuala Lumpur time", …)                                            // 2026-09-10T06:32:00Z → "10 Sep 2026, 14:32 (GMT+8)"
```

- [ ] FAIL → implement §2, §3.1 → PASS. Commit `feat(po-document): the purchase order's data, built once and shared`

### Task 3: The renderer and the fonts

**Files:** `package.json` (`@react-pdf/renderer`), `src/lib/po-document/render.tsx`, `src/lib/po-document/render.test.tsx`, `src/lib/po-document/fonts/*.ttf` + `LICENSE.txt`, `next.config.ts`, `src/app/api/shop/documents/probe/route.ts`

- [ ] `npm install @react-pdf/renderer` — pin the exact version in the commit message.
- [ ] Failing test: `renderPoDocument(sample)` resolves to bytes starting with `%PDF-` and longer than 10 kB; the text layer (`pdf-parse` is not a dependency — instead assert the bytes contain the reference string, which react-pdf embeds uncompressed in the content stream when `compress: false` is passed for the test).
- [ ] Implement §3.2. Build; inspect `.next/server/app/shop/checkout/review/page.js.nft.json` for the five TTF paths and record the count — knowing this proves nothing about Vercel, which is what the probe is for.
- [ ] Open the rendered PDF (write `sample.pdf` to the scratchpad from the test) and compare against `purchase-order-preview.html` side by side at 100%: masthead, meta strip, parties, three lines, totals, notes, signatures, footer. Screenshot both into the report.
- [ ] Commit `feat(po-document): render the A4 purchase order with @react-pdf/renderer`

### Task 4: Generate at send, regenerate on demand

**Files:** `src/lib/r2.ts` (`putObject`), `src/lib/po-document/attach.ts`, `src/lib/po-document/attach.test.ts`, `src/actions/cart.ts`, `src/actions/cart.test.ts`, `src/actions/web-orders-client.ts`, `src/actions/web-orders-client.test.ts`

- [ ] Failing tests (`attach.test.ts`, mocks prisma, r2, render): creates a `Document` with `mimeType: "application/pdf"`, `uploadedById` = `placedById`, `originalName: "W-2609-00007 purchase order.pdf"`, `sizeBytes` = the bytes' length; the final `r2Key` matches `/^po\/\d{4}\/\d{2}\/[^/]+\.pdf$/`; links `webOrder.documentId`; returns the existing id without rendering when one is set; when `putObject` rejects, the row is deleted and null returned. `cart.test.ts`: `submitWebOrder` still returns success when `attachWebOrderDocument` throws. `web-orders-client.test.ts`: `regenerateWebOrderDocument` refuses another buyer's order.
- [ ] FAIL → implement §3.3 → PASS.
- [ ] Browser: send an order as the test client → `SELECT "documentId" FROM "WebOrder" WHERE reference = …` non-null; `SELECT "r2Key", "mimeType", "sizeBytes" FROM "Document" WHERE id = …`; `aws s3api head-object` (or the R2 dashboard) shows the object at that key with that size. Wait an hour — or set `ORPHAN_AGE_MS` to 0 locally, call presign twenty times — and prove the sweep left it (`SELECT count(*)` unchanged).
- [ ] Commit `feat(shop): a purchase order PDF is generated and filed the moment an order is sent`

### Task 5: Confirm carries the document; the list knows the source

**Files:** `src/actions/web-orders.ts`, `src/actions/confirm-web-order.test.ts`, `src/lib/queries/po-list.sql.ts`, `src/lib/queries/po-list.sql.test.ts`, `src/components/purchase-orders/PoTable.tsx`, `src/app/(portal)/purchase-orders/[id]/page.tsx`

- [ ] Failing tests: `confirmWebOrder` passes `documentId: "doc1"` to `writePurchaseOrder`; each branch's SQL contains `AS "source"`; the web branch's `'web'`.
- [ ] FAIL → implement §3.4, §4 → PASS.
- [ ] Browser (ops): confirm the order at `/web-orders/[id]` → `/purchase-orders` shows it with *PDF* and *WEB* chips and *From the shop*; its detail page previews the generated PDF under *Purchase order — generated on the shop*; *Download original* saves `W-… purchase order.pdf`. Delete the PO as super admin → the web order is back in the queue with its `documentId` intact (query it).
- [ ] Commit `feat(ops): a confirmed shop order carries its purchase order, and the list says where it came from`

### Task 6: The client's purchase orders — route, list, viewer

**Files:** `src/lib/shop-routes.ts` (+test), `src/app/api/shop/documents/[documentId]/url/route.ts`, `src/lib/queries/client-documents.ts`, `src/lib/queries/client-documents.test.ts`, `src/components/review/DocumentPreviewLoader.tsx` + `DocumentPreview.tsx` (`urlPath`), `src/app/(storefront)/shop/purchase-orders/page.tsx`, `…/[id]/page.tsx`, `src/components/shop/purchase-orders/PurchaseOrderRows.tsx`, `PoDocumentBar.tsx`, `CloseTab.tsx`, `src/app/globals.css` (`--container-a4`), `src/components/shop/ShopAccountMenu.tsx`, sent page, `WebOrderReceipt.tsx`

- [ ] Failing tests: `listClientPurchaseOrders` merges both sources, sorts desc, pages, and its selects contain no `notes`, `reviewedBy`, `confirmedBy`; `loadClientPurchaseOrder` returns null for another buyer's id and for a superseded PO; the route's `where` is asserted by equality (extract the query into `client-documents.ts` as `findClientDocument(buyerId, documentId)` so it is testable).
- [ ] FAIL → implement §5 → PASS.
- [ ] Browser as the client: `/purchase-orders` lists the sent order; the row opens a new tab; the bar names the file; *Download PDF* answers 302 then 200 with `content-disposition: attachment; filename="W-… purchase order.pdf"` (read from the network panel); the stepper shows *Order placed* with today's date after ops confirmed; the PDF renders. Another buyer's document id on the URL route → 404; a guest → the proxy redirect. The sent page's download works; the receipt's link resolves.
- [ ] Commit `feat(shop): the client's purchase orders — list, viewer with the stage, download`

### Task 7: Verification, cleanup, history

- [ ] Suite, types, lint, build. Sweep `/purchase-orders`, `/purchase-orders/[id]`, `/checkout/sent/…`, ops `/purchase-orders` and a PO detail × {390, 768, 1440}.
- [ ] `RESEND_API_KEY` permitting, the receipt with the download link; otherwise say it was logged.
- [ ] Remove test data: the web order, its document row **and the R2 object**, the PO if confirmed, the DRAFT; counts and the bucket listing before/after.
- [ ] **After deploy** (when this merges): `GET https://www.lovinghandsportal.com/api/shop/documents/probe` as a signed-in member — record the status and the byte count. Until then the fonts on Vercel are unverified, and the history entry says so.
- [ ] `context/current-feature.md` entry.

## 7. Acceptance criteria

1. Sending an order produces a `Document` row and an R2 object; the PDF's total equals the order's snapshot to the cent; the file opens and matches the artboard.
2. The document survives the orphan sweep — proven, not assumed.
3. Confirming the order in ops writes a `PurchaseOrder` whose `documentId` is that document; the PO list shows it as *PDF* + *WEB* + *From the shop*; the detail page previews it; deleting the PO leaves the web order with its document.
4. The client sees their purchase orders — generated and scanned — with the stage above each, downloads the PDF with the right filename, and cannot reach another buyer's document (404 on the wire).
5. Generation failing does not lose the order; *Prepare the PDF* recovers it.
6. No ops name, remark or stage note appears anywhere on the two client screens (checked against the full HTML, as on 2026-09-10).
7. Zero horizontal overflow at 390, 768 and 1440 on both client routes.
8. The production probe answers 200 with a byte count after deploy — or the entry says it has not been run.

## 8. Out of scope

- **The buyer's own product code on the document** — Phase 22 changes `buildPoDocumentData`'s source; the column exists from this phase.
- **A PDF for scanned orders** — they already have one, the customer's.
- **Regenerating after ops edits at confirm** — the document records what the buyer sent; ops' figures live on the `PurchaseOrder`.
- **Email attachments** — a link, not a 90 kB attachment, in the receipt.
