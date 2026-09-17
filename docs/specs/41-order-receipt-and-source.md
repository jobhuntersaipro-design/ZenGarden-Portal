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
  receivedBy   User?     @relation("webOrdersReceived", fields: [receivedById], references: [id], onDelete: SetNull)
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
- Revalidates `/purchase-orders`, `/` and `shopPath.orders()`, matching decline,
  **and `/web-orders/[id]`** — added during the build. The action's own
  revalidation re-renders the page the button sits on, so the form does
  **not** call `router.refresh()`: the project recorded in Phase 30 that a
  refresh after an action is a second render, and one awaited inside a pending
  transition deadlocked. Measured in the browser: the Receive button went away
  with no refresh and no reload.
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

**The write is guarded too, not only the read** — found by the final
whole-branch review. Confirm reads the order, checks it is `RECEIVED`, writes
the purchase order, then marks the web order `CONFIRMED`. That last write was
an `update` on the id alone. Under READ COMMITTED a decline committing between
the read and the write would have been overwritten: the order `CONFIRMED`, a
purchase order committed, and the buyer emailed both "not accepted" and
"confirmed". The write is now `updateMany` on `{ id, status: RECEIVED }`, and a
count of 0 throws `ALREADY_REVIEWED` inside the transaction, which rolls back
the purchase order written a moment earlier and answers "This one has already
been reviewed." The race predates this phase, but this phase widened decline
to `RECEIVED`, the exact state confirm reads. `confirm-web-order.test.ts` pins
the `where` and the `data` by equality and covers the count-0 case.

**As built, two additions.** Receive and Confirm each scope their own spinner
— a `receiving` flag beside the existing `declining` one — so pressing Receive
spins Receive alone; the plan had them share one expression. And the order's
own pane, `SubmittedOrderPane`, gained `min-w-0` on its section and on the
placed-by row, with `break-all` on the contact's email, because at 390px a
long contact name and email pushed the page to 405px (§10, criterion 10).
That file predates this phase; the page is one this phase names.

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
  `complete` prop becomes `state?: "pending" | "received" | "confirmed"`. Of
  the four calling screens only the buyer's order page, `orders/[id]`, passes
  `state`; the cart, the checkout review and the sent screen render before the
  team has touched the order, where the default `pending` is the truth.
  **No fifth step** — the bar is a
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
already carries. The pill's dot is **neutral** — `bg-ink-secondary` for Shop,
`bg-ink-tertiary` for Manual. The plan gave Shop `accent-blue`, which
`00-master.md` §4 reserves for a process in flight; where an order came from is
a permanent fact, so it takes no status colour, and §4 now says so.
Consequences:

- The duplicate `WEB` chip beside the PO number is **removed** — it exists
  only because there was no column to say this in.
- *Uploaded by* returns to being about people. Its `source === "web"` branch
  **stays**, and now prints `—` rather than "From the shop", for **every** shop
  row, confirmed ones included. The branch cannot be replaced by "no uploader,
  so a dash": since Phase 37 a confirmed shop order *has* an uploader — the
  buyer's own contact, whom the generated PDF is filed against — and printing
  that name would say a customer uploaded a scan. The plan deleted the branch;
  the live drive then read "Phase 41 Test Contact" in the column, and it was
  restored.
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
`'RECEIVED'` for those rows and `'NEEDS_REVIEW'` for a submitted one, through a
`CASE` on the web order's status — **never the raw column**. The plan emitted
the column itself, and `'SUBMITTED'` is not an `IntakeStatus`: the badge looks
its tone up by that key, finds nothing, and throws, so every submitted shop
order would have crashed `/purchase-orders`.

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
whose Source is Shop**, confirmed ones included. Its dot is `bg-ink-secondary`,
the Source column's Shop colour — it filters on provenance, not on a state to
act on — where it had borrowed the amber *Needs review* dot.

**The dashboard links to `shop-open`, not to `web`** — found by the final
whole-branch review. The dashboard's work queue says "N orders from the shop to
confirm", counting `openWebOrderCount`: web orders in `SUBMITTED` or `RECEIVED`.
It linked to `?status=web`, and once that chip took in confirmed shop purchase
orders, "1 order from the shop to confirm" landed on that order plus every shop
order ever confirmed — against `00-master.md` §4, which requires a number and
the table under it to agree. The fix is a list filter with no chip,
`status=shop-open`: the web-order branch of the union alone, with
`wo."status" IN ('SUBMITTED', 'RECEIVED')`, and neither the draft branch nor
the purchase-order branch. It is in `STATUSES` on the page and in the
`StatusChip` type, but not in `CHIPS`, so while it is the filter no chip reads
selected. Two reasons it is not a chip: a SUBMITTED-only chip cannot exist,
because *Needs review* also holds scan drafts; and a visible chip was not asked
for — it is a `CHIPS` entry away if it is wanted. `po-list.sql.test.ts` pins
the branch and the status list for both the table query and its summary.

## 7. Every reader of SUBMITTED

The load-bearing part of this phase. `RECEIVED` is a new state in the middle
of a lifecycle eleven modules already branch on, and the failure mode is
silent: a query that still says `status = 'SUBMITTED'` will simply stop
returning received orders, with no error and **no type failure**. Each of
these was found by grep and must be decided deliberately:

| Reader | Decision |
|---|---|
| `po-list.sql.ts` `webOrderRows` | `IN ('SUBMITTED','RECEIVED')`; status column is a `CASE` emitting `RECEIVED` or `NEEDS_REVIEW` (§6), never the raw value |
| `po-list.sql.ts` `includesWebOrders` | splits the two across the two chips (§6) |
| `web-orders.ts` `listBuyerOrders` | include `RECEIVED` — or the buyer's order vanishes from their own list |
| `web-orders.ts` `loadBuyerOrder` | include `RECEIVED` — or their order page 404s |
| `web-orders.ts` `openWebOrderCount` | include `RECEIVED`: still work waiting, still belongs on the dashboard queue |
| `shop-checkout.ts` `loadSentOrder` | include `RECEIVED` |
| `product-detail.ts` open shop orders | include `RECEIVED` |
| `buyer-detail.ts` open shop orders | include `RECEIVED` |
| `purchase-orders.ts` `deletePurchaseOrder` | **a writer, not a reader** — see below the table |
| `web-order-document.ts` draw guard | allow `RECEIVED`. **`confirmWebOrder` itself depends on this**, not only the buyer's page: it draws the purchase-order file while the order is still `RECEIVED`, so a guard refusing it wrote `documentId` null on every confirmed shop order |
| `buyer-activity.ts` label map | add `RECEIVED: "Received"` — done in the migration's own task, because the map is a `Record<WebOrderStatus, string>` and `tsc` fails the moment the enum gains a value |

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

**As built, two rows are not pinned that way.** `buyer-activity.ts` needs no
test: the `Record` type is a compile-time exhaustiveness check. `buyer-detail.ts`
has no test file, and its analytics dependencies are wide enough that one was
not written for a single `where`; its widening rests on reading the code. The
`web-order-document.ts` row is tested against the **real** guard, not a mock,
because every confirm test mocks that module and so could never catch it.

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

## 10. Acceptance criteria — as measured

Driven in a browser on the development database on 2026-09-16 and 2026-09-17
(MYT), with every write read back from the database. Reports:
`.superpowers/sdd/2026-09-16-order-receipt-and-source/` —
`task-11-report.md`, `task-12-report.md`, `task-13a-measurements.md` and
`task-13-fix-report.md`.

**Every ops action below was a super admin's.** `aisha@lovinghandsportal.com`
read `SUPER_ADMIN` in development before any task of this phase touched her,
and was left so. Criterion 11's "a real `MEMBER` can receive" is therefore not
proven live (§11).

**The fixtures were inserted directly, not sent through the cart.** Submitting
through the cart runs `notify()`, which mails every active member and super
admin — real inboxes. The throwaway `CLIENT` was `delivered@resend.dev`,
Resend's own test inbox, so the buyer-facing mail this phase sends went
nowhere real. Three orders were used: `W-2609-00021` (received, then
confirmed), `W-2609-00022` (received, then declined) and `W-2609-00023` (left
submitted, for the overflow re-measure).

1. **Pass on the list; the order was not placed through the cart.** Before
   receiving, `/purchase-orders` read **Needs review 4** and *Received* with no
   count. `W-2609-00023`, submitted, read on `?status=web` at 1440 as Status
   **Needs review**, Source **Shop**, Uploaded by **—**, Confirmed by *Not
   confirmed*.
2. **Not driven from the action's own return.** The screen was read at 390,
   768 and 1440: **Receive order** enabled, **Confirm order** `disabled`, and
   the caption "Receive this order before confirming it." The server's refusal
   with that string is covered by `confirm-web-order.test.ts` — "refuses an
   order nobody has received yet, and says which mistake it is" — and not by a
   live call.
3. **Pass.** Receiving `W-2609-00021` read back `status RECEIVED`,
   `receivedAt 2026-09-16T16:15:47.074Z`, received by Aisha Rahman. The chips
   moved by one each: **Needs review 4 → 3**, **Received 0 → 1**, and the one
   row under *Received* read Status **Received**, Source **Shop**. The Receive
   button was gone in the next snapshot with no refresh and no reload. The
   second receive, on `W-2609-00022`, toasted "Order received. The buyer has
   been told." **318 ms** after the click; the server logged
   `receiveWebOrder` at 66 ms.
4. **Pass on screen; the email was sent, not read.** The buyer's `/orders` row
   for `W-2609-00021` read **Received by the team**. Its order page's step bar
   read `Cart, done | Review, done | Confirm, done | Received, done` with no
   `aria-current` step, identically at 390, 768 and 1440. The send went through
   `after()` to Resend's test inbox with no send error in the server log; no
   inbox was opened.
5. **Pass, and the document is real.** With Expected delivery set to
   2026-09-25, Confirm toasted "Order confirmed." after **806 ms** (server
   661 ms) and landed on the new purchase order. Read back: web order
   `CONFIRMED`; `receivedById` still Aisha's and `receivedAt` unchanged at
   16:15:47.074Z, beside `reviewedById` and `reviewedAt 16:39:18.963Z`; the
   purchase order `W-2609-00021` at stage `ORDER_PLACED`, total 420,
   `deliveryDate 2026-09-25`, and **`documentId cmu4bso97000052otzg7ccpyd`,
   not null**. R2 `HeadObject` on its key answered **3992 bytes,
   `application/pdf`**. This is the only live proof of the document fix
   recorded below: the fixture had no document, so the confirm had to draw the
   PDF while the order was still `RECEIVED` — exactly the path that had been
   writing `documentId` null — and every automated confirm test mocks that
   module. Counts moved purchase orders **400 → 401**, documents
   **406 → 407**, line items **1606 → 1607**, stage events **2323 → 2324**;
   products stayed **308**. The buyer's page then read **Confirmed** on the
   last step and offered **Download PDF**, whose URL route answered **200**.
6. **Not driven.** "This one has already been received." rests on
   `receive-web-order.test.ts` — "refuses an order somebody else already
   received, and writes nothing else".
7. **Pass from `RECEIVED`; from `SUBMITTED` on unit tests.** `W-2609-00022`
   was received, then declined with a reason: toast after **305 ms** (server
   166 ms). Read back: `status DECLINED`, `receivedById` and `receivedAt`
   **still set**, `reviewedById` and `reviewedAt` written, the reason stored,
   no purchase order and no document. The buyer's `/orders` read **Not
   accepted**, RM 210.00.
8. **Pass, after a fix.** Every scan row read Source **Manual**. `?status=web`
   returned **1 row** — `W-2609-00021`, Status *Order placed*, Source **Shop**,
   Confirmed by Aisha Rahman — so a confirmed shop order now appears under
   *From the shop*; the declined `W-2609-00022` did not. That confirmed row's
   Uploaded by read "Phase 41 Test Contact", the defect recorded below, fixed
   in `f8a76cd`. The fix's `—` was read live only on a submitted row, which
   carried no uploader before the fix either; the confirmed case rests on the
   code, which asks `source` before it reads a name.
9. **Pass, and descending alone would have proved nothing.** At page size 10,
   `?sort=source&dir=desc` read "1–10 of 407" with `W-2609-00021` — the only
   Shop row — **first, 1 of 407**. But the default sort, PO date descending,
   also puts it first, because 17 Sep 2026 is the newest date in the list, so a
   page-local sort would draw the same page. The ascending direction is the
   proof: `dir=asc` page 1 held **ten Manual rows and no Shop row**, and page
   41 (401–407) ended with `W-2609-00021` as **row 407 of 407**. Only a sort
   over the whole list moves a row from position 1 to position 407. (407 = 401
   purchase orders + 6 unconfirmed scan extractions.)
10. **Pass, after a fix.** `scrollWidth` / `innerWidth` at height 900:

    | Page | 390 | 768 | 1440 |
    |---|---|---|---|
    | `/purchase-orders` | 390 / 390 | 768 / 768 | 1440 / 1440 |
    | `/web-orders/[id]`, submitted | **405 / 390** → 390 / 390 | 768 / 768 | 1440 / 1440 |
    | buyer's `/orders/[id]`, received | 390 / 390 | 768 / 768 | 1440 / 1440 |

    The 405 was found by the sweep and traced by swapping text in place: the
    contact name "Phase 41 Test Contact" replaced by "X" brought the page to
    390, the product name did not. Fixed in `SubmittedOrderPane` (§4) and
    re-measured at all three widths against a contact named "Phase 41 Overflow
    Test Contact With A Long Name", its email still whole at 390, wrapped onto
    two lines. Under 44px at 390: `/purchase-orders` — the skip link, the Sort
    label, 10 card-mode PO links (308×24), 10 buyer-name links (224×21) and an
    `sr-only` label; `/web-orders/[id]` — the skip link and five field labels;
    the buyer's page — the skip link, the wordmark (136.3×32.5), the search bar
    and its 32px button, 9 category chips at 36px and 7 footer links. Every one
    is an already-accepted class or a label beside a control that clears 44px.
    **Receive order, Confirm order and Decline all clear 44px**, and nothing
    this phase added is on the list.
11. **The refusals pass; a real `MEMBER` receiving is not proven.** A guest
    `curl` on `/web-orders/[id]` got **307** to `/signin?next=…` on the portal
    host and **404** on the shop host; the `CLIENT`'s own session got **404**,
    "Page not found", with "Confirm as a purchase order" absent from the body.
    The action refusing a non-staff caller is `receive-web-order.test.ts` —
    "refuses a caller who is not ops staff". Every live receive was a super
    admin's.
12. **Pass.** **1145/1145 tests across 93 files**, `tsc --noEmit` clean,
    `npm run lint` 0 errors and the same 2 pre-existing warnings (`username`
    in `src/actions/clients.test.ts:183` and
    `src/lib/validation/clients.test.ts:57`), and `npm run build` exit 0, at
    `a9657eb`; after the fix commit `f8a76cd`, tests (1145/1145), `tsc` and
    lint re-run clean. Every §7 row has a test pinning its `where` except
    `buyer-activity.ts`, checked by the compiler, and `buyer-detail.ts`, which
    is unpinned (§7). After the final review's fixes (§4, §6): **1149/1149
    tests across 93 files**, `tsc --noEmit` clean, lint 0 errors and the same 2
    warnings, `npm run build` exit 0.

**Cleanup, counted both ends.** Two web orders and their two lines, one
purchase order with its line item and stage event, one `Document`, one
`AuditEvent` and one `LoginAttempt` from the `CLIENT`'s shop sign-in, and the
`CLIENT` itself were deleted **by id**; the PDF was deleted from R2 and a
second `HeadObject` answered **NotFound (404)**. Read back: users **2**,
`CLIENT` **0**, web orders **0**, web-order lines **0**, purchase orders
**400**, products **308**, buyers **11**, documents **406**, line items
**1606**, stage events **2323**, audit events **5**, login attempts **68**,
product prices **0**, accounts **1**, reset tokens **0** — the baseline
exactly. The overflow fixture (`W-2609-00023`, its line and its `CLIENT`) was
deleted by id the same way, returning users 2, web orders 0, audit events 5,
login attempts 68 and purchase orders 400.

### Found during the build

Each of these was caught before it merged — two by reading the plan before
any code, six in review (two of them by the final whole-branch review), two
only in the browser. None was caught by a
failing test.

- **A `tsc` failure baked into the first task.** The plan added `RECEIVED` to
  the enum in Task 1 and its label to `buyer-activity.ts` in Task 7, but that
  map is a `Record<WebOrderStatus, string>`, so Task 1's own "clean `tsc`" step
  could not pass. Found reading the plan before any code; the label moved into
  Task 1.
- **Every submitted shop order would have crashed the list.** The plan's SQL
  emitted the raw status column, and `'SUBMITTED'` has no entry in the badge's
  tone map, which throws. Found reading the plan; the column became a `CASE`
  (§6). A second, shorter window of the same kind existed between Tasks 8 and
  9, where a received row crashed the list because `IntakeStatus` had no
  `RECEIVED` key yet and an `as IntakeStatus` cast hid it from `tsc`; Task 9
  closed it, and nothing merged in between.
- **Every confirmed shop order lost its document.** Once confirm required a
  received order, `confirmWebOrder` drew the purchase-order PDF while the order
  was `RECEIVED`, and the document guard accepted only `SUBMITTED` and
  `CONFIRMED`, so `documentId` was written null — no document for ops, no
  download for the buyer. No test could see it, because the confirm tests mock
  that module. Found by a reviewer reading across two tasks; the guard was
  widened, tested against the real function, and proved live (criterion 5).
- **Two SQL tests passed with their behaviour deleted.** One asserted
  `'SUBMITTED'`, `'RECEIVED'` and the status column as separate substrings,
  all three already supplied by the `WHERE`; the other asserted that
  `"PurchaseOrder"` and `"WebOrder"` appeared somewhere in the shop chip's SQL.
  Both came from the plan. Each now asserts its exact string, and each was
  watched failing — the label reverted to a flat `'NEEDS_REVIEW'`, the shop
  chip's `EXISTS` deleted — before being trusted.
- **Pressing Receive spun Confirm too.** Both buttons shared one pending
  expression from the plan, against the 2026-09-06 click-feedback rule that the
  spinner belongs on the element pressed. A `receiving` flag now scopes it.
- **The Source dot took a status colour.** The plan gave Shop `accent-blue`,
  which §4 of `00-master.md` reserves for a process in flight. Found in review;
  both dots are neutral, and §4 records the rule.
- **The plan deleted a guard that was load-bearing.** It removed the Uploaded
  by column's `source` branch as redundant; the live drive then read the
  buyer's contact as the uploader of a confirmed shop order. Restored, printing
  `—` (§6).
- **Confirm could overwrite a decline.** Its final write guarded on the id
  alone, so a decline committing mid-transaction would have left a
  `CONFIRMED` order and a committed purchase order behind a buyer told "not
  accepted". Found by the final whole-branch review; the write is guarded on
  `RECEIVED` and rolls back on a miss (§4).
- **The dashboard's shop line led to more rows than it counted**, once the
  *From the shop* chip took in confirmed orders. Found by the final
  whole-branch review; it links to the chip-less `shop-open` filter (§6).
- **`/web-orders/[id]` overflowed at 390px**, 405 against 390, from a contact's
  name and email that would not shrink inside a grid item with
  `min-width: auto`. Pre-existing — the file was last changed in Phase 38 — but
  on a page criterion 10 names. Fixed and re-measured (criterion 10).

## 11. Not verified

- **Anything on production.** This branch has never been deployed; no
  production row or R2 object was read or written, and the migration has not
  run there.
- **A real `MEMBER` receiving.** Every live receive, confirm and decline was a
  super admin's. `receiveWebOrder` sits behind the same `requireUser()` guard
  as confirm and decline, and the member case rests on that and on unit tests.
- **`confirmWebOrder` called directly on a submitted order.** Only the disabled
  button and its caption were seen; the refusal string is unit-tested. A
  crafted Server-Action POST is not a valid probe — Phase 40 found it answers
  "Server action not found" for a super admin too.
- **Two people receiving at once**, and receiving the same order twice. The
  guard on `status: SUBMITTED` and its "already been received" message rest on
  unit tests.
- **The emails arriving.** Receive, confirm and decline each sent to Resend's
  test inbox with no error logged; no inbox was read.
- **An order placed through the real cart.** Every fixture was a direct insert,
  so `submitWebOrder`, `notify()` and the submit-time PDF were not exercised by
  this phase — they are unchanged by it (§8).
- **Declining from `SUBMITTED`**, live — driven in Phase 38, unit-tested here.
- **Uploaded by reading `—` on a confirmed shop row.** Seen live only on a
  submitted row; the confirmed case is verified by reading the code.
- **The buyer-detail page's open shop orders.** The widened `where` has no test
  harness and was not driven in a browser.
- **The list and the buyer's page at every width after confirming.** The list
  was swept with the order received, the buyer's page only while received.
- **The dashboard's `shop-open` link, live.** It renders only with an
  unconfirmed shop order, and development holds none. The filter rests on
  `po-list.sql.test.ts` and on reading `WorkQueue`, the page's `STATUSES` and
  `baseSelect`; no browser or database was used for the final review's fixes.
- **Confirm racing a decline**, live. The guarded write and its rollback rest
  on `confirm-web-order.test.ts`, whose transaction mock cannot itself roll
  anything back — that part rests on Prisma's interactive transaction.
- **The buyer downloading the PDF's bytes.** The route answered 200 with a
  presigned URL and `HeadObject` proved the object, but the browser's own
  fetch of the R2 URL from `shop.localhost` was blocked by CORS.

## 12. Risks

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
