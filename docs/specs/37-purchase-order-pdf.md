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

## 4. Verified in the browser, as a real buyer and a real member

A throwaway `CLIENT` contact was created against Acme Industrial Sdn Bhd and
two orders were placed through the cart, confirmed, and deleted afterwards.

- **The file is real, and so is where it lives.** Sending `W-2609-00016`
  wrote a `Document` — `application/pdf`, **4058 bytes**, `originalName`
  *W-2609-00016 purchase order.pdf*, `uploadedById` the buyer's own contact —
  and `headObject` on its key answered `EXISTS ContentLength=4058
  type=application/pdf`. `WebOrder.documentId` pointed at it.
- **The document is the order.** Opened, the PDF printed `W-2609-00016`, the
  buyer's name and email, order date *15 Sep 2026*, the requested date the
  buyer had picked (*30 Sep 2026*), payment terms *30 days* from the buyer
  record, the line `ZEN-SC-1000-GM · ZEN 1L — Goat's Milk · 1 × 210.00`,
  a total of **210.00**, and the buyer's own note.
- **The download is buyer-scoped, measured on the wire.** The route answered
  **302** to a presigned R2 URL; following it gave **200**,
  `Content-Type: application/pdf`, **4058 bytes**, and
  `Content-Disposition: attachment; filename="W-2609-00016 purchase order.pdf"`.
  The bytes began `%PDF-`. A **guest** got `307` to `/signin`; **another
  buyer's seeded scan** answered `404`, as did a made-up id — proving the
  `webOrder` scope, since that scan exists and is readable through the ops
  route.
- **The orphan sweep was watched leaving it alone, in the state that
  matters.** With the document aged three hours — `extraction: null`,
  `purchaseOrder: null`, order still `SUBMITTED`, which is the profile it
  holds for days — `deleteOrphans()` swept **0** and the row survived. Run
  with the *old* `where`, the same query selected **exactly one** document in
  the whole database: this one. The unit pin was also watched failing when
  the clause was deleted and passing when it was restored.
- **Ops sees the purchase order.** `/purchase-orders?status=web` listed the
  order; confirming it landed on the purchase order, whose left pane now
  reads **"Purchase order · generated on the shop"** and renders the PDF in
  `DocumentPreview` — a canvas at 467×660 carrying *PURCHASE ORDER*,
  *W-2609-00016*, *15 Sep 2026*, *30 Sep 2026* — beside a link back to what
  the buyer sent. **This is the first time that pane has ever displayed a
  document**: every seeded one 404s, because the seed writes `r2Key` values
  it never uploads.
- **The list still says where it came from.** The confirmed row read
  `PDF WEB W-2609-00016 … From the shop … AR Aisha Rahman`. Without the
  `source` column it would have printed the buyer's contact as the uploader,
  because the generated file is filed against them. The **Uploaded by**
  filter offered *Aisha Rahman* and *Chris Lam* only.
- **The email carries it, against the real API.** The first order's mail was
  refused by **Resend itself** for the `@example.com` address — the Phase 25
  finding, not a defect here. Repointed at Resend's own test inbox,
  `sendEmail` with the order's 3974-byte PDF attached returned
  **`{ sent: true }`**.
- **The receipt only promises what is there.** Rendered to markup in the
  cart's own test, the buyer's copy carries *"Your purchase order is
  attached"* when the file exists and no mention of an attachment when it
  does not. The sentence was deleted and the test watched failing.
- **The sent screen says what is true at the moment it is read.** On the
  first paint — before `after()` has finished — it read *"Your purchase order
  is attached to the email we just sent"*; reloaded once the file existed, the
  same line became *"Your purchase order is ready to download"* with a link.
- **Sweep:** the buyer's order page, the sent screen and the ops purchase
  order at 390/768/1440 — nine combinations, `scrollWidth === innerWidth` on
  all, **0 console errors**. Sub-44px at 390: the shop's 88×32 search button
  (accepted since Phase 17) and the inline *ready to download* link inside a
  sentence, the same class as the other in-prose links.
- **989 tests** (22 new), **`tsc --noEmit`**, **`npm run lint`** (the same 2
  pre-existing warnings, 0 errors) **and `npm run build` all clean.**
- **Cleanup, counted both ends.** Two web orders, their lines, the purchase
  order confirmed from one with its line item and stage event, both
  `Document` rows, **both R2 objects** (`headObject` → `NotFound` on each),
  the throwaway contact, its audit rows and every login attempt this pass
  created were deleted by id. Counts returned exactly: users **2**, CLIENT
  **0**, web orders **0**, lines **0**, purchase orders **400**, line items
  **1606**, documents **406**, products **308**, families **59**, audits
  **5**, login attempts **63**; `aisha@lovinghandsportal.com` read back as
  `MEMBER`.

## 5. Known, recorded rather than fixed

**The stored file is the order as sent.** It is drawn once, when the buyer
sends, and not redrawn at confirm — so it carries the requested date and not
the PO number or delivery date the team settles afterwards. That is defensible
(it is the buyer's own document, and the screen always shows the current one)
but it is a decision, not an oversight. Regenerating at confirm is a few lines
in `confirmWebOrder` and belongs with Phase 38, where a confirmed delivery
date first exists to print.

**The supplier block still prints only a name.** No `OrgSettings` row exists,
so address, email and phone are unset on the file exactly as they are on the
screen — carried from Phase 33 and still worth filling in on `/admin` before a
purchase order reaches a real customer. It now reaches one as an email
attachment, which raises the stakes on it.

**Two `sendEmail` calls, two attachments, one render.** The bytes are held in
memory and passed to both mails. At 4 kB that is nothing; a hundred-line order
would be larger but still small. If it ever matters, the ops copy is the one
to drop — they have the file on the purchase order.

## 6. Not verified

Anything on production. This branch has not been deployed, and production's
`DIRECT_URL` still points at the pooled Neon host (Phase 30), which both this
migration and Phase 36's will hit. **`@react-pdf/renderer` has never run on
Vercel's linux runtime** — it loads a WebAssembly layout engine, and the sharp
failure of 2026-09-08 is precisely the case where a laptop build proves
nothing about the deployed one. The first deploy should be checked by sending
one order and reading `WebOrder.documentId`. A purchase order long enough to
run to a second page was rendered in a unit test but never read as a physical
file, so pagination of the repeating line header is unproven by eye. The
decline path was not driven: no declined order exists in development.
