# Phase 41 — Receiving a shop order, and where a purchase order came from

**Goal:** An admin explicitly **receives** a shop order before anyone can
confirm it, the buyer is told when that happens, and the purchase-order list
carries a **Source** column saying whether each row came from the shop or was
uploaded by hand. Asked for as: "revamp this page. admin should be able to
receive the purchase order when an order is place from shop.lovinghandsportal
by buyer. Also, it also need to add once more column named source, indicating
if this PO is coming from shop or uploaded manually. Also superadmin or admin
need to be receiving email when an Purchase Order is placed by buyer."

**Architecture:** One additive migration — a fifth `WebOrderStatus` value,
`RECEIVED`, and two nullable columns on `WebOrder` (`receivedById`,
`receivedAt`). One new email template. One new Server Action. No new
dependency.

**Branch:** `feature/order-receipt`, from `main`, after Phase 40.

**Decisions taken with the user (2026-09-16):**

1. Receiving is a **gate**: `SUBMITTED → RECEIVED → CONFIRMED`, and Confirm is
   refused until an order has been received.
2. The buyer **sees it and is emailed** — a third mail in the sequence, after
   the receipt and before the confirmation.
3. A received order gets **its own badge and its own filter chip**, so the
   queue splits into untouched and acknowledged.
4. Source is a **pill column placed after Status**.
5. The duplicate rows visible on production (`CP 00150` twice,
   `SVPPPO26090009` twice) are **out of scope** — see §9.

## 1. What already exists, and must not be rebuilt

Two of the three things asked for are already built, and this was confirmed
with the user before any of this was specified. Recording it here so nobody
re-derives it or writes a second copy:

- **Admins are already emailed on every shop order.** `notify()` in
  `src/actions/cart.ts` mails **every active `MEMBER` and `SUPER_ADMIN`** the
  moment a buyer sends an order, with the generated purchase-order PDF
  attached and a link to `/web-orders/{id}`. Template
  `src/emails/WebOrderPlaced.tsx`, subject from `webOrderPlacedSubject`. The
  user confirmed they receive it. **This phase changes none of it.**
- **Shop orders already reach the ops queue and can already be confirmed.**
  They appear in the purchase-order list as `WEB` rows (Phase 16), open at
  `/web-orders/[id]`, and `confirmWebOrder` writes a real `PurchaseOrder`
  with a delivery date and emails the buyer (Phase 38).

What is genuinely missing is the **acknowledgement** — between "the buyer
sent it" and "the team committed to a delivery date" there is a gap that can
last days, and nothing in the product says a human has seen the order. And
the **Source** is present in the data but not as a column: `source: "web" |
"scan"` already rides on every row, rendered only as a small `WEB` chip
beside the PO number and as the words "From the shop" sitting in the
*Uploaded by* column, which is why it reads as absent.

## 2. The RECEIVED state

```prisma
enum WebOrderStatus {
  DRAFT
  SUBMITTED
  RECEIVED   // a person has acknowledged it; not yet a purchase order
  CONFIRMED
  DECLINED
}
```

On `WebOrder`, beside the existing `reviewedBy`/`reviewedAt`:

```prisma
  receivedById String?
  receivedBy   User?     @relation("webOrdersReceived", fields: [receivedById], references: [id])
  receivedAt   DateTime?
```

**Why not reuse `reviewedById`/`reviewedAt`.** Those are written by
`confirmWebOrder` and `declineWebOrder` and mean *who decided*. Receiving and
deciding are two acts by potentially two people, and collapsing them would
make "Received by" lie the moment a second person confirms.

**Migration.** One migration, `20260918090000_web_order_received`, adding the enum
value and the two columns. No existing row changes: every order in flight
stays `SUBMITTED` and must be received before it can be confirmed, which is
the intended behaviour rather than a backfill.

> **Rule inherited from Phase 15, and the reason that phase needed two
> migrations:** Postgres will not let a newly added enum value be *referenced*
> in the same transaction that adds it. Adding columns does not reference it,
> so one migration is correct here — but if the implementation adds a CHECK
> constraint, a default, or any DDL spelling `'RECEIVED'`, it must be split in
> two, or `migrate dev` will pass locally and `migrate deploy` will fail in
> production.

## 3. Receiving, the action

New: `receiveWebOrder(webOrderId)` in `src/actions/web-orders.ts`.

- Guarded by the file's existing `guard()` → `requireUser()`, so **any signed-in
  ops member may receive**, the same access confirm and decline already have.
  Receiving is not a super-admin act; it is the queue being worked.
- Written with the same optimistic-concurrency shape as `declineWebOrder` and
  `advanceStage` — `updateMany` guarded on `status: SUBMITTED`, and
  `count === 0` returns "This one has already been received." Two people
  clicking at once cannot both win.
- Sets `status: RECEIVED`, `receivedById`, `receivedAt`.
- Revalidates `/purchase-orders`, `/` and `shopPath.orders()`, matching decline.
- Emails the buyer inside `after()` through `sendEmail`, which never throws. A
  failed send is a missing nudge, not a failed acknowledgement.

**Declining** accepts `RECEIVED` as well as `SUBMITTED` — an order a person
has looked at is exactly the one they may then turn down. Its guard becomes
`status: { in: [SUBMITTED, RECEIVED] }`.

**Un-receiving is not offered.** There is no path back to `SUBMITTED`. If an
order is received in error the two real outcomes are still available: confirm
it or decline it with a reason.

## 4. Confirm requires a received order

`confirmWebOrder`'s in-transaction guard changes from

```ts
if (order.status !== WebOrderStatus.SUBMITTED) throw new Error("ALREADY_REVIEWED");
```

to requiring `RECEIVED`, with `SUBMITTED` getting its own message — "Receive
this order before confirming it." — rather than the generic already-reviewed
line, because those are two different mistakes and only one of them is the
user's to fix.

`WebOrderReviewForm` disables **Confirm order** until the order is received
and puts **Receive order** in its place as the primary action, in the same
shape as the Phase 04 totals gate: the button is refused *and* the screen says
why. The server check is the real gate; the disabled button is the courtesy.

## 5. The buyer sees it, and hears about it

- **`buyerOrderStatus`** (`src/lib/buyer-order-status.ts`) gains a case. The
  buyer's `kind` union — today `"confirmed" | "submitted" | "declined"` —
  takes a fourth member, `"received"`, mapped in both places that build it
  (`listBuyerOrders` and `loadBuyerOrder` in
  `src/lib/queries/web-orders.ts`). Label: **"Received by the team"**, against
  "Awaiting confirmation" for one still `SUBMITTED`.
- **`CheckoutSteps`** keeps its four steps. Its last step already renames
  itself from "We'll be in touch" to "Confirmed" when an order is confirmed;
  it now also reads **"Received"** at the received state. The boolean
  `complete` prop becomes `state?: "pending" | "received" | "confirmed"` and
  all four calling screens are updated. **No fifth step** — the bar is a
  checkout progress indicator, and an ops queue state does not earn a column
  in the buyer's mental model of their own checkout.
- **New email**, `src/emails/WebOrderReceived.tsx`, following
  `WebOrderConfirmed`: the reference, the buyer's own PO number, the line
  count, the total, and a link to `${SHOP_URL ?? APP_URL}/orders/{id}`. It
  says the team has the order and that a delivery date follows — it must not
  promise a date, because there is none yet. No attachment: the buyer already
  has the PDF from their receipt, and re-attaching it invites them to think
  something changed.

## 6. The ops list

**The Source column.** A new sortable column between Status and Uploaded by,
rendering a pill: **Shop** or **Manual**, read from the `source` field the row
already carries. Consequences:

- The duplicate `WEB` chip beside the PO number is **removed** — it exists
  only because there was no column to say this in.
- *Uploaded by* returns to being about people. Its `source === "web"` branch,
  which prints "From the shop", is dropped; a shop row shows `—`.
- `source` joins `PO_LIST_SORT_KEYS` and `ORDER_COLUMNS` in
  `src/lib/queries/po-list.sql.ts`. It is an allow-list, and that is the only
  reason a key is safe in an `ORDER BY`.
- `mobileHidden` is **not** set: on a phone the card mode drops *Uploaded by*
  and *Confirmed by* as noise, but where an order came from is the one thing
  this change exists to show.

**The Received badge.** `IntakeStatus` in
`src/components/portal/StatusBadge.tsx` gains `RECEIVED`, label "Received",
tone `accent-blue` — the token that already means "a process is running",
which is exactly true of an order a person has picked up. The list's SQL emits
`'RECEIVED'` for those rows instead of `'NEEDS_REVIEW'`.

**The Received chip.** `StatusChip` gains `"received"`, with a count beside it
like *Needs review*. This means:

- `poListNeedsReviewQuery` gets a sibling, `poListReceivedQuery`.
- **`needs-review` stops counting received orders.** Today
  `includesWebOrders` puts every `SUBMITTED` web order under `needs-review`;
  it now puts `SUBMITTED` there and `RECEIVED` under `received`, so the two
  chips partition the shop backlog instead of overlapping. This is the point
  of the state — if both chips counted the same rows, receiving would tell the
  team nothing.
- `STATUSES` in `src/app/(portal)/purchase-orders/page.tsx` must list it. A
  chip whose value is missing there changes the URL and is then silently
  ignored — the defect Phase 11 hit on `/products`, and the file says so.

**The "From the shop" chip becomes honest.** Today it matches only unconfirmed
shop orders, because it selects the web-order branch of the union alone — a
*confirmed* shop order has `source: "web"` in its own row and does not appear
under the chip that claims to filter on exactly that. With a Source column on
screen, that gap becomes visible and wrong. The chip now means **every row
whose Source is Shop**, confirmed ones included.

## 7. Every reader of SUBMITTED

The load-bearing part of this phase. `RECEIVED` is a new state in the middle
of a lifecycle eleven modules already branch on, and the failure mode is
silent: a query that still says `status = 'SUBMITTED'` will simply stop
returning received orders, with no error and **no type failure**. Each of
these was found by grep and must be decided deliberately:

| Reader | Decision |
|---|---|
| `po-list.sql.ts` `webOrderRows` | `IN ('SUBMITTED','RECEIVED')`; status column emits which |
| `po-list.sql.ts` `includesWebOrders` | splits the two across the two chips (§6) |
| `web-orders.ts` `listBuyerOrders` | include `RECEIVED` — or the buyer's order vanishes from their own list |
| `web-orders.ts` `loadBuyerOrder` | include `RECEIVED` — or their order page 404s |
| `web-orders.ts` `openWebOrderCount` | include `RECEIVED`: still work waiting, still belongs on the dashboard queue |
| `shop-checkout.ts` `loadSentOrder` | include `RECEIVED` |
| `product-detail.ts` open shop orders | include `RECEIVED` |
| `buyer-detail.ts` open shop orders | include `RECEIVED` |
| `purchase-orders.ts` `deletePurchaseOrder` | **a writer, not a reader** — see below the table |
| `web-order-document.ts` draw guard | allow `RECEIVED`; refusing would break the buyer's own document |
| `buyer-activity.ts` label map | add `RECEIVED: "Received"` |

`deletePurchaseOrder` is the one that is not a filter. Deleting a purchase
order returns its shop order to the queue — today as `SUBMITTED`, clearing
`reviewedById` and `reviewedAt`. It must clear `receivedById` and
`receivedAt` in the same update and keep returning the order to `SUBMITTED`,
not to `RECEIVED`: a row sitting in `SUBMITTED` while still naming who
received it is a lie, and an order coming back into the queue is exactly an
order that needs a person again.

**Test posture:** each inclusion above gets a unit test that pins the `where`
by equality, in the shape `shop-viewer.test.ts` already uses for the leak
guard. A `status` filter that silently narrows is the exact class of defect
Phase 16 recorded when `documentId` became nullable and inner joins quietly
dropped every shop order.

## 8. What does not change

- `notify()` and `WebOrderPlaced` — the admin email already works (§1).
- The cart, pricing, the submit transaction, the generated PDF.
- `PurchaseOrder` and its stages. Receiving happens entirely before a shop
  order becomes a purchase order; no `PoStage` is involved.
- Uploaded scans. They have no `WebOrder` and cannot be received; their
  intake is unchanged, and their Source reads **Manual**.

## 9. Out of scope, deliberately

- **The duplicate rows on production.** `CP 00150` appears twice and
  `SVPPPO26090009` twice under two spellings of one buyer. These are real
  business records; 2026-09-09 already established that which spelling is
  correct is the customer's own convention and not something to infer.
  Nothing here deletes or merges them.
- **A full re-layout** of the purchase-order page. `CLAUDE.md` makes the
  Claude Design canvas the source of truth for visuals, and there is no
  artboard for a redesigned list. This phase adds a column and a chip within
  the existing layout.
- **Rate limiting shop submissions.** The open-order cap was removed earlier
  today at the user's request; nothing throttles submission now, and that is
  recorded rather than reinstated here.

## 10. Acceptance criteria

1. A buyer places an order; it appears under *Needs review* with Source
   **Shop**, and **not** under *Received*.
2. `confirmWebOrder` called on that order is **refused** — read from the
   action's own return, not the disabled button — with "Receive this order
   before confirming it."
3. An ops member receives it. `receivedById` and `receivedAt` are written and
   read back; the row moves to the *Received* chip and out of *Needs review*;
   both chip counts change by one.
4. The buyer's `/orders` reads **Received by the team**, their order page's
   step bar reads **Received**, and the email arrives.
5. Confirm now succeeds, writes a `PurchaseOrder`, and `receivedById` survives
   the confirmation alongside `reviewedById`.
6. Receiving the same order twice returns "This one has already been
   received." and writes nothing the second time.
7. Declining works from `RECEIVED` as well as from `SUBMITTED`.
8. An uploaded scan reads Source **Manual**; a confirmed shop order reads
   **Shop** and appears under the *From the shop* chip.
9. Sorting on Source orders the whole list, not the page — proved with a
   figure only the whole list has, as Phase 35 proved its own sort.
10. `/purchase-orders`, `/web-orders/[id]` and the buyer's order page at
    390 / 768 / 1440: `scrollWidth === innerWidth` on all nine, and the new
    Source column does not push the table into the page.
11. A real `MEMBER` can receive; the action refuses a `CLIENT` and a guest.
12. Tests, `tsc --noEmit`, `npm run lint` and `npm run build` all clean, and
    every §7 row has a test pinning its `where`.

## 11. Risks

- **The §7 table is the whole risk.** A missed reader does not fail loudly; it
  makes an order disappear from one screen. The buyer-facing three
  (`listBuyerOrders`, `loadBuyerOrder`, `loadSentOrder`) are the worst: a buyer
  would see their own order vanish between placing it and its confirmation.
- **Production carries live shop orders.** `W-2609-00001` is real and sits in
  `SUBMITTED`. After the deploy it must be received before it can be
  confirmed — expected, but the team should be told rather than discovering a
  disabled button.
- **Production's `DIRECT_URL`** has pointed at the pooled Neon host since
  Phase 30. This phase carries a migration. Phases 36–40 deployed on
  2026-09-16 with two migrations and succeeded, so the fault may have been
  fixed or may simply not have recurred; confirm before merging rather than
  assume.
