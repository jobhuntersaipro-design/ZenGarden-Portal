# Phase 38 — Order confirmation and the expected delivery date

**Goal:** Confirming a shop order requires an expected delivery date, prefilled
from what the buyer asked for; the buyer is emailed when the order is
confirmed or declined, and sees the date on the shop; the team can move the
date afterwards and the buyer hears about that too; a product's page shows
the open shop orders that contain it. Asked for as: "admin or superadmin
should see the order placed under Purchase Order tab, pending approval and
review the delivery date. Once the delivery date is confirmed, it should be
reflected to shop and send email to buyer saying the order is confirmed and
showing expected delivery date. Product page should note there's an
associated Purchase Order."

**Architecture:** No migration. `PurchaseOrder.deliveryDate` has existed since
Phase 01 and nothing has ever read or written it; it becomes the expected
delivery date. Two new email templates. No new dependency.

**Branch:** `feature/order-confirmation`, from `main`, after Phase 37.

**Decisions taken with the user (2026-09-15):** the date is required to
approve a shop order; the "product page" is the ops product detail.

## 1. What was missing

A shop order already lands under Purchase orders as a "From the shop" row
with its own review screen, and confirming it writes a `PurchaseOrder`. But
the buyer's `requestedDate`, written at submit and printed on their own
document, was never selected for the review screen — the person confirming
the order could not see what was asked for. No confirmed delivery date existed
anywhere. Confirm and decline sent no email, so the buyer's only signal was a
visit to `/orders`. And a product sitting in five unconfirmed shop orders
showed no demand on its page, because order history reads confirmed
purchase-order lines only.

## 2. Confirming needs a date

The review pane shows *Delivery requested*. The form gains *Expected delivery*,
a date field prefilled from it, and Confirm is disabled while it is empty; a
date earlier than today is allowed but captioned. The value travels in the
confirm options — kept out of `PoDraftSchema`, so `confirmPurchaseOrder` for
an uploaded PO is untouched and an upload still confirms with no date, which
is right: a scanned PO may not carry one.

`writePurchaseOrder` stores it as UTC midnight of the chosen day, the same
trick `submitWebOrder` uses for `requestedDate`, so the `@db.Date` column keeps
the day that was picked. `updatePurchaseOrder` and the edit sheet allow it to
be changed afterwards, with an *Edited: expected delivery* activity entry.
The PO's summary shows it; the lifecycle caption says "in n days", or "n days
overdue" in the palette's red.

## 3. The buyer sees it, and hears about it

`/orders` gains an *Expected delivery* column, sortable, blanks sinking both
ways. `/orders/[id]` carries it in its header and on the document's meta
strip — `PoDocumentData.deliveryDate`, rendered by both the preview and the
PDF, as a fifth cell only when there is a value. A submitted order's status
reads **Awaiting confirmation** rather than "With the team": there is now a
concrete event the buyer is waiting for. The steps bar's last step reads
**Confirmed** once it is.

Three emails, all sent from `after()` and all fail-soft:

- `WebOrderConfirmed` on confirm — the reference, the PO number, the expected
  date, the total, a link, and the PDF attached.
- `WebOrderDeclined` on decline — the reason the team typed, which the form
  already promises the buyer sees.
- `WebOrderConfirmed` again, with an *Updated* subject, when the team moves
  the date on a purchase order that came from the shop. A silently moved date
  is exactly what a buyer would complain about.

The attached file is the order **as sent**: it carries the requested date, not
the expected one, which is in the email body and on every screen.
Regenerating the file at confirm is a follow-up.

## 4. The product page

`/products/[id]` gains *Open shop orders · n awaiting confirmation*: each
submitted-but-unconfirmed order containing the product, with its reference
(linking to the review screen), buyer, cartons, and the dates placed and
requested. It renders only when there is at least one. Once the order is
confirmed it appears in the existing order history like any other purchase
order.
