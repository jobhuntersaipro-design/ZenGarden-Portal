# Phase 33 — The purchase order preview, and the steps

**Goal:** The buyer reads the actual purchase order before confirming, and can
see where they are in the journey at every point. Asked for as: "still no
preview of the purchase order?" and "show the step for each order. Cart →
Review → Confirm → Will be contact by team."

**Architecture:** No migration, no new dependency. The document is the
approved artboard `docs/design/storefront/purchase-order-preview.html`, drawn
from a pure builder, on the review screen. The steps are one small component
placed on four screens.

**Branch:** `feature/po-preview-and-steps`, from `main`.

## 1. The document

`src/lib/purchase-order-document.ts` is pure — no Prisma client, no I/O, no
React — and is the single place that decides what goes on a purchase order, so
the preview a buyer confirms and any file generated later cannot disagree.

**The total is summed from the document's own lines, never echoed from the
caller**, so a purchase order whose rows do not add up to its own total cannot
be rendered. `documentAgreesWithOrder` then compares that sum against the
figure the order will actually be submitted at, and the review screen refuses
to draw the document if they differ rather than letting a buyer approve a page
that contradicts the button beside it. Twelve unit tests, including the
disagreement case.

`PurchaseOrderPreview` renders it. The artboard prints raw hex, which
`context/coding-standard.md` forbids in a component, so `#292d34` became
`text-ink`, `#6f6f6f` `text-ink-tertiary`, `#646464` `text-ink-secondary` and
`#e8e8e8` `border-hairline`. Two tokens were added to the spacing scale —
`--spacing-po-page` (A4's 794px) and `--spacing-po-totals` — on the spacing
scale rather than as containers, because that is where `w-*` reads from, as
the existing `min-w-line-items` already shows.

**It is fixed at A4 and its container scrolls.** A document that reflows is
not the document: the reader is checking what the seller will hold.

It updates as the buyer types. The PO number, the requested date and the note
appear on the document as they are entered, so what is confirmed is what was
read.

## 2. The steps

`CheckoutSteps` — **Cart → Review → Confirm → We'll be in touch** — on four
screens:

| Screen | State |
| --- | --- |
| `/cart` (signed in, non-empty) | step 1 |
| `/checkout/review` | step 2 |
| `/checkout/sent/[reference]` | steps 1–3 done, step 4 current |
| `/orders/[id]`, submitted | steps 1–3 done, step 4 current |
| `/orders/[id]`, confirmed | all four done, then the six fulfilment stages |
| `/orders/[id]`, declined | step 3, not step 4 |

Two deliberate restraints. **A guest's cart gets no bar**, because their next
step is signing in, not Review, and a bar promising otherwise would mislead.
**A declined order stops at Confirm**, rather than promising a call that is not
coming.

Nothing in the bar is clickable: it reports progress, and a link back to a
step already left would invite a half-finished order.

The review screen's button is **Confirm order**, matching the step.

## 3. Verified in the browser as a real client

- The bar reads `1 Cart / 2 Review / 3 Confirm / 4 We'll be in touch`, with
  step 1 current on the cart and step 2 on review.
- The document drew the buyer's name and address, the supplier, order date
  `14 Sep 2026`, delivery requested `30 Sep 2026`, payment terms `30 days`,
  currency `MYR`, the line with its SKU, pack caption, cartons, unit price and
  amount, the subtotal, `Total (MYR)`, the note, both signature rules and the
  footer carrying our own `W-…` reference.
- **It followed what was typed**: the document's reference read
  `W-2609-00012` before a PO number was entered and `ACME-PO-909` after.
- Confirming landed on the sent screen with Cart, Review and Confirm marked
  done and "We'll be in touch" current.
- The order page showed the same three done and step 4 current, above "The
  team has your order and will confirm it shortly."
- Sweep at 390/768/1440 over cart, review, sent and an order page: twelve
  combinations, no page overflow, 0 console errors. The document holds 794px
  at every width and its container scrolls at 390 and 768.

## 4. Two defects the browser found that the build and the types did not

**The Prisma runtime was being sent to the browser.** The document builder
imported `Prisma` from `@/generated/prisma/client` for `Decimal`, and
`ReviewSendForm` is a client component — so the review page failed outright
with "the chunking context does not support external modules (request:
node:module)". `tsc`, lint and the unit tests all passed. It imports
`@/generated/prisma/browser` now, the entry the shop's product page already
uses. The same class as the ~1 MB of DiceBear once shipped to the browser.

**The A4 pushed the page sideways.** At 390 the page measured 856 against 390,
and at 768 it measured 860. The scrolling container was a grid item, and a
grid item's default `min-width: auto` let it grow to the document's own 794px
instead of clamping. `min-w-0` fixed it — the third time this project has been
caught by that rule.

**And one inconsistency, fixed:** a hand-rolled `toLocaleDateString("en-GB")`
printed "30 Sept 2026" beside an order date of "14 Sep 2026". The document now
uses the project's own `formatDate`, so both read `d MMM yyyy`.

## 5. Known, and it needs a decision rather than code

**The supplier block prints only a name until someone fills the contact
details in.** `OrgSettings` holds no row and no `ZEN_GARDEN_*` variable is set,
so Phase 24's per-field fallback correctly yields nothing for the address,
email and phone. A purchase order that names the buyer fully and the seller by
name alone is not what should reach a customer. Filling in *Contact details*
on `/admin` populates it, with no deploy.

The artboard's tax row is not rendered: `ZEN_GARDEN_TAX_LABEL` and
`ZEN_GARDEN_TAX_RATE` belong to Phase 19 and do not exist, and a row that
always reads zero is worse than none.

## 6. Not verified

Anything on production. This is a preview, not a stored file: no PDF is
generated, nothing is written to R2, and the buyer cannot yet download a
purchase order after the fact — that remains Phase 19, still unbuilt. The
browser's own print is the only way to keep a copy today.
