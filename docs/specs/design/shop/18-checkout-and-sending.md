# Phase 18 — The checkout gate, review & send, order sent

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A guest with a full cart signs in — or asks for an account — at one gate, reviews the order with their own PO number, a requested delivery date and a note, sends it, and lands on a confirmation; ops approves a new customer by picking or creating the buyer.

**Architecture:** Three routes under `/checkout`. The gate is public and hosts the credentials sign-in beside an access-request form that writes an `AccessRequest` of kind `CLIENT`; `/admin` shows those with a buyer picker whose approval runs the Phase 15 invite. Review & send is the Phase 16 `submitWebOrder` behind a proper form; the cart page stops sending. The client gets a receipt email.

**Tech Stack:** As 17, plus `src/lib/rate-limit.ts` for the request form and `src/emails/` (React Email) for the two new templates.

**Spec:** this file, `00-overview.md`, artboards `Checkout`, `ReviewSend`, `OrderPlaced` and the prototype's checkout view. Read `docs/specs/15-client-accounts.md` §5 (the invite) and `16-storefront.md` §3, §5 (email).

**Branch:** `feature/shop-checkout`. Depends on 17.

## Global constraints

- All of Phase 17's, unchanged.
- `submitWebOrder` stays the only place a price is written, and `writePurchaseOrder` the only writer of a `PurchaseOrder`.
- No enumeration: the request form answers the same way whether or not the address is known.
- `requireSuperAdmin()` on every admin action; a client request can never be approved as staff and a staff request never as a client.
- Every email goes through `sendEmail`, which never throws, inside `after()` where the client is waiting.

---

## 0. Why this exists

Phase 17 ends at a button. This phase is what the button opens: the canvas's *one gate*, where sign-in happens and nowhere earlier, and where a new company asks for an account through the queue ops already run. It also moves the order's own facts — the buyer's PO number, the requested date, the notes — out of two inputs on the cart and onto a screen whose whole job is to review what is about to be sent, because those three fields are what Phase 19 prints at the top of the purchase order and nothing ever filled them in.

## 1. Routes

| Browser path | File | Who |
|---|---|---|
| `/checkout` — the gate | `src/app/(storefront)/shop/checkout/page.tsx` | guest (a client is redirected to review) |
| `/checkout/review` — review & send | `…/checkout/review/page.tsx` | client |
| `/checkout/sent/[reference]` — order sent | `…/checkout/sent/[reference]/page.tsx` | client |

`shop-routes.ts` gains `shopHref.checkout()`, `shopHref.checkoutReview()`, `shopHref.orderSent(reference)`, the matching `shopPath` entries, and `SHOP_PRIVATE_PATHS` gains `"/checkout/review"` and `"/checkout/sent"`. The cart's guest CTA and the footer's *Request an account* retarget to `/checkout` (and `/checkout#request`).

## 2. Data model

```prisma
enum AccessRequestKind { STAFF  CLIENT }

model AccessRequest {
  // …existing…
  kind     AccessRequestKind @default(STAFF)
  /// CLIENT only: what they typed. The buyer is chosen at approval, not here.
  company  String?
  phone    String?
  /// The address the form was posted from; the per-hour cap counts on it.
  ip       String?
  /// Set at approval for CLIENT requests, so the row records which buyer it became.
  buyerId  String?
  buyer    Buyer? @relation(fields: [buyerId], references: [id])
}
```

Migration `prisma/migrations/20260911100000_client_access_requests/migration.sql`: `CREATE TYPE "AccessRequestKind"`, the four `ADD COLUMN`s (`kind` `NOT NULL DEFAULT 'STAFF'`), the FK `ON DELETE SET NULL`. One migration is fine: the type is *created* here, not extended — the two-file rule from Phase 15 is for referencing a value added to an existing enum.

`WebOrder.requestedDate` already exists and is written by nothing; this phase writes it.

## 3. The gate — `/checkout`

Server page: `loadShopViewer()`; a client is `redirect(shopHref.checkoutReview())`. A guest gets, page width on `bg-surface`:

- *← Back to cart* (brand-link), `h1` `display-md` **Sign in to send your order**, the paragraph "Orders are placed against your company account, so we know where to deliver and how to invoice. Everything in your cart is kept."
- Two columns `lg:grid-cols-[1fr_400px]` → `lg:grid-cols-[minmax(0,1fr)_var(--container-panel-md)]` (28rem = 448px; the canvas draws 400 — one step, recorded), `gap-2xl`.
- **Card 1** `rounded-lg border-hairline bg-canvas p-xl`, `heading-sm` **I have a Loving Hands account**: `CheckoutSignInForm` — Email address, Password (`PasswordInput`, *Forgot password?* link to `/forgot-password`), **Sign in and review my order** `h-control-lg rounded-pill` (the screen's dark pill), footnote "Customer accounts use email and password. The Google button on the staff sign-in page does not apply here." Errors through `Notice` with the same two strings `SignInForm` uses.
- **Card 2** `heading-sm` **I'm new to Loving Hands**, the paragraph, `RequestAccountForm`: Company name, Your name, Work email, Phone in a 2-column grid; **Request an account** outlined (`border-ink`), caption "Your cart stays on this device while you wait." On success the card's body is replaced by a `Notice tone="success"`: "Thanks — we have your request and will be in touch, usually within one working day." The anchor `id="request"` is on this card.
- **Right**: `CheckoutSummary` (client) — `heading-sm` **What you're sending**, a row per guest line (48px thumb, name, `"3 cartons × RM 225.50"`, amount), Total `heading-md tabular-nums`, the caption "Prices are today's and are fixed at the moment you send the order. Delivery is quoted separately when our team confirms it.", and the `bg-surface rounded-md` info box "Sending an order does not charge you. Our team reviews it and confirms before anything ships." An empty guest cart shows "Your cart is empty." and a *Browse the catalogue* link instead.

**Sign-in sequence** in `CheckoutSignInForm` (the merge has to finish *before* review renders, so the layout's `GuestCartMerge` is too late here):

```ts
const result = await signIn("credentials", { email, password, redirect: false });
if (result?.error) { setError(...); return; }
const lines = parseGuestCart(localStorage.getItem(GUEST_CART_KEY)).lines;
if (lines.length > 0) {
  const merged = await mergeGuestCart(lines);     // a staff account gets { success: false } here
  if (merged.success) localStorage.removeItem(GUEST_CART_KEY);
}
router.push(shopHref.checkoutReview());
router.refresh();
```

A member who signs in here lands on `/checkout/review`, whose layout redirects staff to the portal — the same rule as everywhere on the shop.

## 4. Requesting an account

```ts
// src/lib/validation/access-requests.ts
export const shopAccessRequestSchema = z.object({
  company: z.string().trim().min(2, "Tell us your company's name").max(160),
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: emailSchema,
  phone: z.string().trim().min(6, "A phone number we can call").max(40),
});
export type ShopAccessRequestInput = z.infer<typeof shopAccessRequestSchema>;
```

```ts
// src/actions/access-requests.ts   "use server"
/**
 * Public. Writes one AccessRequest of kind CLIENT and tells the super admins.
 *
 * Answers identically for a new address, a known address and a declined one
 * — "we'll be in touch" — so the form cannot be used to learn who is a
 * customer. A repeat from the same address refreshes lastSeen and sends no
 * second email, exactly as queueAccessRequest does for Google sign-ins.
 */
export async function requestShopAccount(input: ShopAccessRequestInput): Promise<ActionResult>;
```

Rate limit: `checkAccessRequestAllowed(ip)` in `src/lib/rate-limit.ts` — refuse when more than **5** `AccessRequest` rows carry this `ip` in the last hour ("Too many requests from this connection. Try again in an hour."). The IP is `clientIp(await headers())`. An existing `User` with that email is treated like a known request: refresh nothing, say the same thing.

Email: `src/emails/ClientAccessRequested.tsx` — *"{name} at {company} is asking for a shop account"*, the phone and email, **Review in admin** → `${APP_URL}/admin`; to every active `SUPER_ADMIN`, only on first sight.

## 5. Approving a customer in `/admin`

`listPendingRequests` (`src/lib/queries/users.ts`) adds `kind`, `company`, `phone`. `PendingRequests` renders a `CLIENT` row differently: a *Customer* `RingBadge`, the company under the name, the phone under the email, and in place of the role select a **buyer picker** — the review screen's `Combobox` with `options` = every buyer (`{ id, label: name }`, passed from the admin page via a new `listBuyerOptions()` in `src/lib/queries/buyers.ts`) and one `pinned` row **Create buyer “{company}”** (`id: "new"`). *Approve* is disabled until a choice is made; *Decline* is the existing control.

```ts
// src/actions/users.ts — addition
export type ClientApproval = { buyerId: string } | { newBuyerName: string };
/**
 * A CLIENT request becomes a buyer contact. Everything the Phase 15 invite
 * does — CLIENT role, buyerId, bcrypt, mustChangePassword, the temporary
 * password mailed to the shop host — happens through the same helper it
 * uses, so there is one way to mint a client.
 */
export async function approveClientRequest(requestId: string, target: ClientApproval): Promise<ActionResult>;
```

Transaction: load the request (`PENDING`, `kind === CLIENT`, else "That request has already been decided" / "Approve a customer request with a buyer"); buyer = `findUnique` or `create({ name: newBuyerName, contactName: request.name, email: request.email, phone: request.phone })`; `createClientContact(tx, { buyerId, name, email })`; request → `APPROVED`, `decidedById`, `decidedAt`, `buyerId`. After the transaction: `TemporaryPassword` to the shop sign-in URL. Errors: P2002 on `Buyer.name` → "A buyer with that name already exists — pick it from the list."; P2002 on `User.email` → "That email address already has an account."

`createClientContact` is the body of `inviteBuyerContact` lifted into `src/lib/clients.ts`:

```ts
export async function createClientContact(
  tx: Prisma.TransactionClient,
  input: { buyerId: string; name: string; email: string },
): Promise<{ id: string; password: string }>;   // the temporary password, for the email
```

`inviteBuyerContact` calls it too. `approveAccessRequest` (staff) refuses a `CLIENT` request: "Approve a customer request with a buyer."

## 6. Review & send — `/checkout/review`

`requireClient()`; `cart = loadCart(user.id)`; empty → `redirect(shopHref.cart())`; any unavailable line → the same (the cart explains it). `loadCart` gains `reference: string | null` (the DRAFT's own `W-…`, for the hint).

Page width on `bg-surface`: `h1` **Review and send your order**, "We'll turn this into a purchase order you can download, and our team will confirm it before anything ships." Two columns `lg:grid-cols-[minmax(0,1fr)_var(--container-panel-sm)]` (24rem = 384px; canvas 340).

`ReviewSendForm` (client, `react` state, no Server Action until Send):

- **Order details** card: *Your own PO number (optional)* — `Input` in `font-mono`, `maxLength 64`, hint "Printed at the top of your purchase order. Leave it blank and we'll use our reference, {reference}."; *Delivery requested (optional)* — `<input type="date">` styled as the design system input, `min` today in KL (`todayISO()`), hint "A request, not a promise — our team confirms the date with you."
- **Deliver to** card: buyer name `body-md font-semibold`, address (`whitespace-pre-line`), `contactName · email`; **Ask us to change this** outlined `h-control-md rounded-pill` → `mailto:${SUPPLIER_EMAIL}?subject=Change of details for ${buyerName}` (omitted when unset); the paragraph "This is the address we hold for your company. Changing it is a message to our team rather than an edit, so your invoicing details stay correct." The card reads `Buyer.name/address/contactName/email` through a narrow select in `loadReviewBuyer(buyerId)` (`src/lib/queries/shop-buyer.ts`).
- **Anything we should know?** card: `Textarea` `min-h-24` `maxLength 2000`, hint "Appears on your purchase order and reaches our team with the order."
- **Right** card: `heading-sm` `"{n} products · {c} cartons"`, a row per line (name, `"3 × RM 225.50"`, amount without the `RM` — the canvas prints bare figures in this column), Total over a `border-t-2 border-ink`, **Send order** `h-control-lg rounded-pill` with the send icon (the screen's dark pill), caption "Prices are fixed at the figures above the moment you send. Delivery is quoted separately when our team confirms."

Send → `submitWebOrder({ buyerReference, requestedDate, notes })` → `router.push(shopHref.orderSent(reference))`. Errors toast.

```ts
// src/lib/validation/cart.ts
export const submitOrderSchema = z.object({
  buyerReference: z.string().trim().max(64).nullable().optional(),
  /** yyyy-MM-dd in Kuala Lumpur; stored as that calendar day. */
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
```

In `submitWebOrder` the update gains `requestedDate: parsed.data.requestedDate ? new Date(\`${parsed.data.requestedDate}T00:00:00.000Z\`) : null` — UTC midnight of the calendar day, the same trick `dateColumnRange` uses so a `@db.Date` column stores the day the client picked and not the day before.

## 7. Order sent — `/checkout/sent/[reference]`

`requireClient()`; `loadSentOrder(buyerId, reference)`:

```ts
export type SentOrder = {
  id: string; reference: string; buyerReference: string | null;
  total: string; placedByEmail: string; submittedAt: Date;
};
// WebOrder where { reference, buyerId, status: { in: [SUBMITTED, CONFIRMED] } }; select exactly those fields; null → notFound()
```

`max-w-[720px]` → `max-w-panel-lg` (32rem; canvas 720 — record), centred, `rounded-xl bg-canvas p-2xl text-center`: a 64px `bg-accent-green/10`… use `bg-surface-soft` circle with a green check; `h1` **Your order is with us**; "We've sent a copy to {email}. Our team reviews every order and will come back to you to confirm the price and the delivery date."; the three-cell strip *Your PO number* (`—` when none) · *Our reference* · *Total*; buttons **Track this order** (ink pill → `/orders/{id}`; Phase 19 adds *Download purchase order (PDF)* beside it) and *← Continue shopping*; the info card "The same purchase order is filed against your order in our system, so when you call us we are both looking at the same document."

## 8. The receipt email

`src/emails/WebOrderReceipt.tsx` — to `placedBy.email`: **We have your order {reference}**; `"{n} lines · {total}"`; "Our team reviews every order and confirms the price and the delivery date with you."; **See your order** → `${SHOP_URL ?? APP_URL}/orders/{id}`. `notifyOps(reference)` in `cart.ts` becomes `notify(reference)` and sends both, still inside `after()`, still through `sendEmail`.

---

## 9. Tasks

### Task 1: Routes

**Files:** `src/lib/shop-routes.ts`, `src/lib/shop-routes.test.ts`

- [ ] Failing test: `shopHref.orderSent("W-2609-00007")` → `/checkout/sent/W-2609-00007`; `isShopPrivatePath("/checkout")` false, `"/checkout/review"` true, `"/checkout/sent/x"` true.
- [ ] Implement §1. PASS. Commit `feat(shop): checkout routes and their private paths`

### Task 2: Client access requests — schema and migration

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260911100000_client_access_requests/migration.sql`

- [ ] Write §2 into the schema and the migration by hand (the 2026-09-09 note: `migrate dev --create-only` prompts in a way a non-TTY cannot answer).
- [ ] `timeout 120 npx prisma migrate deploy` against the development branch; `npx prisma generate`; `npx prisma migrate status` clean.
- [ ] Commit `feat(db): AccessRequest kind, company, phone, ip and buyer`

### Task 3: `requestShopAccount`

**Files:** `src/lib/validation/access-requests.ts`, `src/actions/access-requests.ts`, `src/actions/access-requests.test.ts`, `src/lib/rate-limit.ts`, `src/lib/rate-limit.test.ts`, `src/emails/ClientAccessRequested.tsx`

- [ ] Failing tests (`access-requests.test.ts`, mocks prisma, `@/lib/email`, `next/headers`):

```ts
it("creates a CLIENT request and mails every active super admin once", …)   // accessRequest.create called with kind CLIENT, company, phone, ip; sendEmail to the two admins
it("answers a known address identically and sends nothing", …)             // existing PENDING → update lastSeen only; result equal to the new case
it("answers an existing user identically and sends nothing", …)
it("refuses the sixth request from one ip in an hour", …)                   // accessRequest.count → 5 → { success: false, error: /Too many/ }
it("rejects a two-letter phone and an empty company with the field's message", …)
```

`rate-limit.test.ts`: `checkAccessRequestAllowed` counts `{ ip, firstSeen: { gte: hourAgo } }` and throws `TooManyAttemptsError` at 5.

- [ ] FAIL → implement §4 → PASS. Commit `feat(shop): request a customer account from the checkout gate`

### Task 4: Approving a customer

**Files:** `src/lib/clients.ts` (new, `createClientContact`), `src/actions/clients.ts` (use it), `src/actions/users.ts` (`approveClientRequest`; `approveAccessRequest` refuses CLIENT kind), `src/actions/users.test.ts`, `src/actions/clients.test.ts`, `src/lib/queries/users.ts`, `src/lib/queries/buyers.ts` (`listBuyerOptions`), `src/components/admin/PendingRequests.tsx`, `src/app/(admin)/admin/page.tsx`

- [ ] Failing tests (`users.test.ts`): approving with `{ newBuyerName }` creates the buyer with the request's contact/email/phone, creates a `CLIENT` user with that `buyerId` and `mustChangePassword: true`, marks the request `APPROVED` with `buyerId`, and mails `TemporaryPassword` to `SHOP_URL`; with `{ buyerId }` creates no buyer; a `STAFF` request is refused; a `PENDING` check refuses a decided one; P2002 on the buyer name returns the "pick it from the list" message; a `MEMBER` caller is refused. `clients.test.ts`: `inviteBuyerContact` still writes `role: CLIENT` with a `buyerId` (it now goes through the helper — the test must keep passing unchanged).
- [ ] FAIL → implement §5 → PASS.
- [ ] Browser (`/admin` as super admin; the seeded member promoted on the development branch and reverted after, as on 2026-09-08): a customer request row shows company and phone, the picker lists buyers and the pinned *Create buyer “Acme Industrial Sdn Bhd”*; approving with the pinned row creates `Buyer` and `User` rows (`SELECT role, "buyerId" FROM "User" WHERE email = …` → `CLIENT`, non-null); the request row disappears.
- [ ] Commit `feat(admin): approve a customer request by picking or creating the buyer`

### Task 5: The gate

**Files:** `src/app/(storefront)/shop/checkout/page.tsx`, `src/components/shop/checkout/CheckoutSignInForm.tsx`, `RequestAccountForm.tsx`, `CheckoutSummary.tsx`; `src/components/shop/cart/OrderSummary.tsx` (guest CTA → `/checkout`), `src/components/shop/ShopFooter.tsx` (*Request an account* → `/checkout#request`)

- [ ] Build §3. `CheckoutSignInForm` reuses `FieldLabel`, `PasswordInput`, `Notice`, `Button`.
- [ ] Browser: guest with 2 lines → `/checkout` renders both cards and the summary with the right total; a wrong password shows "Wrong email or password."; the right one lands on `/checkout/review` with the two lines already in the DRAFT (row count) and `localStorage` cleared; a staff account is bounced to the portal. Submitting the request form with a 2-character phone shows the field message; a valid one shows the success notice, and `SELECT kind, company FROM "AccessRequest" WHERE email = …` reads `CLIENT`.
- [ ] Commit `feat(shop): the checkout gate — sign in, or request an account`

### Task 6: Review & send

**Files:** `src/app/(storefront)/shop/checkout/review/page.tsx`, `src/components/shop/checkout/ReviewSendForm.tsx`, `src/lib/queries/shop-buyer.ts`, `src/lib/queries/shop-buyer.test.ts`, `src/lib/queries/cart.ts` (`reference`), `src/lib/validation/cart.ts`, `src/actions/cart.ts`, `src/actions/cart.test.ts`, `src/components/shop/cart/ClientCart.tsx` (replace the send section with a *Review and send* ink pill → `/checkout/review`)

- [ ] Failing tests: `submitWebOrder` stores `requestedDate` as `2026-09-24T00:00:00.000Z` for `"2026-09-24"` and `null` when absent; a malformed date is refused; `loadReviewBuyer` selects exactly `{ name, address, contactName, email }` (assert the `select` object by equality).
- [ ] FAIL → implement §6 → PASS.
- [ ] Browser: fill PO number `ACME-PO-771`, date, a note; Send → `/checkout/sent/W-…`; `SELECT "buyerReference", "requestedDate", notes, status FROM "WebOrder" WHERE reference = …` reads all three and `SUBMITTED`; the ops queue shows the order; `/web-orders/[id]` shows the reference, the requested date and the note in `SubmittedOrderPane` (add the date to that pane — it never showed one because nothing wrote one).
- [ ] Commit `feat(shop): review and send — the buyer's PO number, requested date and notes`

### Task 7: Order sent and the receipt

**Files:** `src/app/(storefront)/shop/checkout/sent/[reference]/page.tsx`, `src/lib/queries/web-orders.ts` (`loadSentOrder`), `src/lib/queries/web-orders.test.ts`, `src/emails/WebOrderReceipt.tsx`, `src/actions/cart.ts` (`notify`), `src/actions/cart.test.ts`

- [ ] Failing tests: `loadSentOrder` returns null for another buyer's reference and for a `DRAFT`; its select has no `notes` from ops and no reviewer; `submitWebOrder` sends two emails — ops and the receipt to `placedBy.email` — with the shop URL in the receipt link.
- [ ] FAIL → implement §7–§8 → PASS.
- [ ] Browser: the sent page shows the three cells with the figures from the review screen; *Track this order* lands on `/orders/{id}`; another buyer's reference is a genuine 404 (status read). With `RESEND_API_KEY` still a placeholder the send is logged, not delivered — say so.
- [ ] Commit `feat(shop): order sent, and a receipt to the buyer`

### Task 8: Verification, cleanup, history

- [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] Sweep `/checkout`, `/checkout/review`, `/checkout/sent/…`, `/admin` × {390, 768, 1440}.
- [ ] Full journey as a real user: guest → 3 products → `/checkout` → request an account → (super admin) approve with a new buyer → invite email's temporary password → sign in on the shop → forced password change → the cart is waiting → review → send → sent page → ops confirms at `/web-orders/[id]` → `/orders/{id}` shows *Order placed*. Record every status and row count on the way.
- [ ] Remove test data: the access request, the buyer and client created by approval, the web order and PO, the DRAFT; member role reverted.
- [ ] `context/current-feature.md` entry.

## 10. Acceptance criteria

1. A guest with a cart reaches `/checkout`, signs in with a password, and arrives at review with the same lines in their account — proven by the `WebOrderLine` count.
2. A signed-in client visiting `/checkout` is sent to review; a guest visiting `/checkout/review` is sent to sign in.
3. Requesting an account creates a `CLIENT` `AccessRequest` with company and phone, mails the super admins once, answers identically for a known address, and stops at five per IP per hour.
4. Approving it with a new buyer name creates the buyer and a `CLIENT` user linked to it, mails a temporary password whose link points at the shop host, and the contact can sign in and order.
5. Approving with an existing buyer creates no buyer; a duplicate buyer name is refused with the "pick it from the list" message; a staff request cannot be approved as a customer nor the reverse.
6. Sending writes `buyerReference`, `requestedDate` (the calendar day picked, not the day before) and `notes`, and both appear on the ops review pane.
7. The sent page shows the buyer's PO number, our reference and the total; the receipt goes to the person who placed the order.
8. The cart no longer sends; its client CTA is *Review and send*.
9. Zero horizontal overflow at 390, 768 and 1440 on the three checkout routes and `/admin`.

## 11. Out of scope

- **The purchase order PDF and its download button** — Phase 19; the sent page ships without it.
- **Editing the buyer's address from the shop** — a message to ops by design (the canvas says so).
- **Google sign-in for clients** — still refused (15 §4).
- **Auto-approving customer requests** — ops decides who sees trade prices; unchanged.
