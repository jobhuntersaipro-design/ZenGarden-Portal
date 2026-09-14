# Phase 32 — Review and send

**Goal:** A buyer sees the whole order before it goes, and gives it the facts
only they have: their own PO number, the date they want it, and anything the
team should know. Asked for as: "a PO preview before letting buyer confirm
orders."

**Architecture:** No migration. This builds the review half of the existing,
never-built `docs/specs/design/shop/18-checkout-and-sending.md`. Two routes,
one new query module, one new email. The cart **stops sending**.

Deliberately out of scope, and still unbuilt: the `/checkout` sign-in gate,
the new-customer access request and its admin approval, all from §3 to §5 of
that same spec.

**Branch:** `feature/product-variants` (built on Phase 31).

## 1. What moved

`WebOrder.requestedDate` has existed since Phase 16 and **nothing had ever
written it**. The client's PO number and notes were two unlabelled inputs
beside the cart's Send button. All three now belong to a screen whose only job
is to show what is about to be sent.

| Before | After |
| --- | --- |
| Cart: two bare inputs and **Send order** | Cart: **Review and send**, a link |
| Requested date: no way to enter it | A date field, `min` today in Kuala Lumpur |
| After sending: a toast | `/checkout/sent/{reference}` |
| Client hears nothing | A receipt email naming the reference |

## 2. Routes

| Browser path | Who | Behaviour |
| --- | --- | --- |
| `/checkout/review` | client | empty cart or an unavailable line redirects to `/cart`; a guest goes to `/signin?next=/checkout/review` |
| `/checkout/sent/[reference]` | client | scoped to the caller's own buyer |

`SHOP_PRIVATE_PATHS` gains `/checkout`, covering both.

## 3. The two reads are narrow on purpose

`src/lib/queries/shop-checkout.ts`, asserted **by equality** in its tests for
the reason Phase 23 pinned `loadShopViewer`:

- `loadReviewBuyer` selects name, address, contact name and email. Not
  `remark`, which is the ops team's private note.
- `loadSentOrder` selects id, reference, buyer reference, subtotal, submitted
  time and the placer's email. Not `reviewedBy`, `declinedReason` or any of
  the ops trail. It also filters on `buyerId` and on a status of SUBMITTED or
  CONFIRMED, so a draft — whose reference the client has never been shown —
  and another company's order both find nothing.

## 4. The date is stored as the day that was picked

`submitWebOrder` writes `new Date(\`${requestedDate}T00:00:00.000Z\`)`. A
timestamp compared against a `@db.Date` column is truncated in **UTC**, so
building it from local midnight would store the day before — the same
off-by-one Phase 06 fixed for `poDate` on 2026-09-06. Picking **25 September**
stored `2026-09-25T00:00:00.000Z`, which reads back as `2026-09-25` in Kuala
Lumpur. A test pins both that and the null case, and a third pins that a
non-date string is refused before anything is written.

## 5. The client gets their own copy

`notifyOps` became `notify`: one read, two emails. Ops keeps
`WebOrderPlaced`; the client gets `WebOrderReceipt`, linking to the **shop**
host, because that is the only host their session exists on. Both still go
through `sendEmail`, which never throws, inside `after()`.

The receipt is sent even when there is no ops staff to tell — the old code
returned early in that case, which would have silently swallowed the
customer's copy too. A test pins it.

## 6. Verified in the browser, end to end as a real client

Signed in as a `CLIENT`, added two flavours of one product through Phase 31's
picker, then:

- The cart offers **Review and send** and no longer carries a Send button or
  its two inputs (both counted: 0).
- Review shows *Order details*, *Deliver to* and *Anything we should know?*
  beside a `2 products · 3 cartons` summary totalling **RM 661.50**. The PO
  hint names the draft's own reference, "Leave it blank and we'll use our
  reference, W-2609-00010." The date field's `min` is today in Kuala Lumpur.
- Sending landed on `/checkout/sent/W-2609-00010` reading "Your order is with
  us", with *Your PO number* `ACME-PHASE32-001`, *Our reference*
  `W-2609-00010` and *Total* `RM 661.50`.
- In the database: `SUBMITTED`, `requestedDate` `2026-09-25`, the note stored,
  two lines snapshotted at `220.50` summing to the `661.50` subtotal.
- The receipt reached Resend and **Resend itself** rejected it, because the
  test address is `@example.com` — the same documented behaviour as Phase 25.
  The log line proves the send: "We have your order W-2609-00010 →
  phase32-client@example.com".
- Guards: the same reference, moved to another buyer for the check, rendered
  "Page not found" and the page did **not** contain the PO number; a made-up
  reference did the same; an empty cart at `/checkout/review` redirected to
  `/cart`; a guest was sent to `/signin?next=%2Fcheckout%2Freview`.
- Sweep at 390/768/1440 over both screens: six combinations, no overflow, 0
  console errors.

**One defect the sweep found and fixed:** the "← Back to cart" link measured
84×15 at 390px, under the 44px floor. It is `h-11 w-fit` now, measured 84×44.

## 7. Known, recorded rather than fixed

`/checkout/sent/{someone else's reference}` answers **HTTP 200** with "Page
not found" in the body rather than a 404 status. That is the app-wide
streaming-layout gap recorded since 2026-09-10 for `/products/[id]`,
`/buyers/[id]` and the rest; the content is right and nothing leaks, only the
status is wrong.

## 8. Not verified

Anything on production. The receipt email's actual delivery — Resend accepted
the request and rejected the test address, so no inbox was read. The ops
review screen for a web order was not re-driven; this phase does not touch it.
