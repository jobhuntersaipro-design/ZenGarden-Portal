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

## 5. Verified in the browser, as a real buyer and a real member

A throwaway `CLIENT` contact was created against Acme Industrial Sdn Bhd, two
orders placed through the cart — one confirmed, one declined — and everything
deleted afterwards.

- **The buyer asks, and the team sees it.** An order placed asking for
  30 Sep 2026 showed on the ops review screen as **Delivery requested ·
  30 Sep 2026**, and the new Expected delivery field arrived **prefilled with
  that same day**. Before this phase the field did not exist and the request
  was on no ops screen at all.
- **The gate was driven, not argued.** Clearing the field disabled Confirm and
  the caption read **"Locked — set an expected delivery date"**. A date in the
  past left Confirm *enabled* with **"That delivery date is in the past"** —
  allowed, because backdating an order already delivered is legitimate, and
  said out loud because it is usually a typo.
- **The day that was picked is the day that was stored.** Confirming with
  2 Oct 2026 wrote `deliveryDate: 2026-10-02T00:00:00.000Z` — UTC midnight,
  which is what a `@db.Date` column keeps, so the 2nd cannot come back as the
  1st.
- **It reaches every screen.** The purchase order's summary read *Expected
  delivery · 2 Oct 2026*; the buyer's list gained an **Expected delivery**
  column reading the same; their order page header read *15 Sep 2026 · Order
  placed · Expected delivery 2 Oct 2026 · Your ref ACME-P38-001*, with
  *"Confirmed by our team. Expected delivery 2 Oct 2026."* beneath the steps.
  The document's meta strip went from four cells to **five** — Order date,
  Delivery requested, Expected delivery, Payment terms, Currency — reading
  15 Sep / 30 Sep / 2 Oct / 30 days / MYR.
- **The lifecycle caption reads against today, in all three states.** Read off
  three seeded orders: an order in production showed *"Expected 24 Sep 2026 ·
  in 9 days"* in `#6f6f6f`; one still delivering past its date showed
  *"Expected 6 Sep 2026 · 9 days overdue"* in `#f0382d`, the palette's red and
  not a second scheme; a delivered order showed **no note at all**, because a
  date already met is history rather than a deadline. No overflow at 390.
- **The steps bar's last step reads Confirmed** on a confirmed order, where it
  read "We'll be in touch". Measured: `Cart, done · Review, done · Confirm,
  done · Confirmed, done`.
- **Moving the date tells the buyer.** Editing it to 9 Oct 2026 from the
  purchase order's own sheet wrote *"Edited: expected delivery"* to the
  activity list, attributed to the member who did it, and the buyer's list
  read **9 Oct 2026** afterwards. The re-send uses the same template with an
  *Updated:* subject.
- **A defect a test caught before the browser could.** The re-send passed the
  raw ISO string to the subject line while the body carried the formatted
  date, so one email would have read *"delivery now expected 2026-10-09"*
  above *"expected on 9 Oct 2026"*. The date is formatted once now and used
  for both.
- **The decline path was driven for the first time in this project.** Every
  previous phase recorded it as unverified because no declined order existed.
  Declining with *"We're out of stock of this line until November."* toasted
  **"Order declined and the buyer told"** — which is now true rather than true
  only in the pull sense — and the buyer's own page showed the steps stopping
  at **3 Confirm** (Phase 33's rule, still holding) above that exact sentence.
  Their list read **Not accepted** with "—" under Expected delivery.
- **The product page counts what is waiting.** With one unconfirmed order
  containing the product, `/products/[id]` read **"Open shop orders · 1
  awaiting confirmation"** with `W-2609-00019 · Acme Industrial Sdn Bhd ·
  1 carton · placed 15 Sep 2026 · wants 20 Oct 2026`. Declining that order
  removed the section entirely — it renders only when there is something in
  it, the rule `WorkQueue` follows.
- **The upload path was proven untouched**, which is what keeps the new
  requirement from spreading: `confirm.test.ts` passes unchanged, and two new
  tests in it confirm an uploaded purchase order with no delivery date at all
  and assert the writer stores one as UTC midnight when given it.
- **Sweep:** five routes × three widths — the buyer's list and order, the ops
  review screen, the purchase order and the product page — fifteen
  combinations, `scrollWidth === innerWidth` on every one, no clipped table
  cell at 390, **0 console errors**. The only sub-44px control on the review
  screen at 390 is the `SkipLink`, an already-accepted class.
- **1012 tests** (23 new), **`tsc --noEmit`**, **`npm run lint`** (the same 2
  pre-existing warnings, 0 errors) **and `npm run build` all clean.**
- **Cleanup, counted both ends.** Two web orders, their lines, the purchase
  order confirmed from one with its line item and stage events, both generated
  documents, **both R2 objects** (`headObject` → `NotFound` on each), the
  throwaway contact, its audit row and this pass's login attempts were all
  deleted by id. Counts returned exactly: users **2**, CLIENT **0**, web
  orders **0**, lines **0**, purchase orders **400**, line items **1606**,
  documents **406**, products **308**, families **59**, audits **5**, login
  attempts **63**; `aisha@lovinghandsportal.com` read back as `MEMBER`.

## 6. Known, recorded rather than fixed

**The column was dead in code but not in data, and it used to mean something
slightly different.** All 400 seeded purchase orders already carry a
`deliveryDate`, written by `prisma/seed.ts` — and Phase 11 removed delivery
date from every screen while deliberately keeping the column so "the data on
400 existing orders survives". That data is *the date printed on the
customer's own purchase order*, where this phase's is *the date the team
commits to*. The two are close but not identical.

In development this is harmless: every seeded row is fiction, and the effect
is simply that every order now shows a date. **On production it should be
invisible**, because `writePurchaseOrder` never wrote the column before this
phase, so every real purchase order there holds null and will read "—" until
someone sets one. Worth checking on the first deploy rather than assuming.

**The stored PDF still carries the requested date, not the expected one.** It
is drawn once when the buyer sends and not redrawn at confirm (Phase 37 §5),
so a buyer who downloads their file after confirmation sees what they asked
for while every screen and the email show what was agreed. Regenerating at
confirm is a few lines and was deliberately left out of both phases.

**A declined order keeps its "Expected delivery" column empty**, which is
right, but the column is also empty for every order still waiting — so the
column alone does not distinguish "not yet promised" from "never will be".
The Status column beside it does.

## 7. Not verified

Anything on production — this branch has not been deployed, and production's
`DIRECT_URL` still points at the pooled Neon host, which Phase 36's and
Phase 37's migrations will both hit. The three emails reached Resend without
error against `delivered@resend.dev`, but no inbox was read: what is proven is
that the API accepted them, not that they render well in a mail client. The
`WebOrderConfirmed` "updated" variant was verified by unit test and by the
absence of a send failure, not by opening the message. Concurrent confirms —
two reviewers pressing Confirm at once — were not exercised beyond the
`updateMany` guard that has covered it since Phase 16.
