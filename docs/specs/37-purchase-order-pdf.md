# Phase 37 — The purchase-order file

**Goal:** The moment a buyer sends an order, a PDF of the purchase order is
generated, stored, filed as a `Document`, attached to the buyer's receipt and
to the team's notification, downloadable by the buyer afterwards, and carried
onto the `PurchaseOrder` when the team confirms it. Asked for as: "send an
email including the purchase order file to customer and notify admin or
superadmin via email with purchase order file too."

**Architecture:** One additive migration, `20260917090000_web_order_document`
(`WebOrder.documentId`, nullable, unique). One new dependency,
`@react-pdf/renderer`, rendering the same `PoDocumentData` the on-screen
preview draws. Supersedes `docs/specs/design/shop/19-purchase-order-document.md`,
whose field names predate the type that shipped in Phase 33 — that type wins.

**Branch:** `feature/purchase-order-pdf`, from `main`, after Phase 36.

## 1. One document, two renderers

`src/lib/purchase-order-document.ts` already decides what goes on a purchase
order, purely, and `PurchaseOrderPreview` draws it in Tailwind. The PDF is a
second renderer of that data, `src/lib/pdf/purchase-order.tsx`, mirroring the
preview section for section: masthead, meta strip, buyer and supplier, the
line grid, totals, notes, signature rules, footer with our own reference.

It is the one file in the repository allowed raw hex — a PDF has no
stylesheet — and its colours are the seven values of the approved artboard,
named in a single map. The module is `server-only` and the package is listed
in `serverExternalPackages`, because it ships a wasm layout engine that a
route chunk cannot carry.

**Fonts are the PDF built-ins, Helvetica and Helvetica-Bold.** Bundling Inter
and Plus Jakarta means `outputFileTracingIncludes`, and 2026-09-08 showed that
a laptop build cannot tell whether that include matched — production 500ed on
sharp after the local artefact looked right. A purchase order in Helvetica is
unremarkable; a purchase order that fails to render in production is not.
Known cost: no CJK glyphs, so a buyer named in Chinese script would print as
boxes. Brand fonts are a follow-up with the deploy-time probe route spec 19
describes.

## 2. Generating and filing

`attachWebOrderDocument(webOrderId)` in `src/lib/web-order-document.ts`:
builds the document from the stored order (the same web-branch read
`loadBuyerOrder` uses, so the file and the screen cannot differ), renders it,
creates a `Document` row (`uploadedById` the buyer's contact, `originalName`
`{reference} purchase order.pdf`, `mimeType application/pdf`), writes the
object to R2 under `po/{yyyy}/{mm}/{id}.pdf`, and links `WebOrder.documentId`.
It is idempotent — an order that already has a file returns it — and never
runs inside the order's own transaction. If the put fails the row is deleted
and it returns null.

`submitWebOrder` calls it in the same `after()` that sends the two emails,
then attaches the bytes to both. **Fail-soft:** if the PDF cannot be produced
the emails still go, without it, and the failure is logged — an order that was
placed must not read as one that was not because a renderer hiccupped.

`sendEmail` gains `attachments`, passed through to Resend.

**The orphan sweep is fixed in the same commit as the migration.**
`deleteOrphans` removes any `Document` with no extraction and no purchase
order after an hour — which describes every generated file until the team
confirms the order days later. Its `where` gains `webOrder: null`, pinned by
an equality test. Nothing else would catch this: the sweep runs on one presign
in twenty and logs a count nobody reads.

## 3. Ops sees the file; the buyer downloads theirs

`confirmWebOrder` passes the web order's `documentId` to `writePurchaseOrder`
(generating the file first if it is somehow missing), closing the
`documentId: null` gap Phase 16 opened. The PO detail page previews it under
"Purchase order · generated on the shop" exactly as it previews a scan.

Two consequences of the `Document` carrying the buyer's contact as its
uploader: the purchase-order list can no longer tell a shop order by its null
uploader, so every branch of the list query emits a `source` column
(`web` / `scan`) and the table prints "From the shop" and a `WEB` chip from
that; and `listFilterOptions` excludes `CLIENT` users from the uploader
filter, so a buyer's contact never appears in an ops picker.

The buyer downloads through a **buyer-scoped** route,
`/api/shop/documents/[documentId]/url`, which answers only for a document
hanging off one of that buyer's own web orders — never a scan the team
uploaded. Phase 35 recorded that `/api/documents/[id]/url` is ops-wide and
declined to expose it; that stance stands. `/orders/[id]` shows *Download PDF*
beside *Print*; the sent screen links it when it exists and otherwise says the
file is attached to the email, because the page renders before `after()` has
finished.
