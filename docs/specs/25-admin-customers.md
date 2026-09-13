# Phase 25 — Admin › Customers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A super admin manages customers from one place — create, edit,
delete a buyer, reset a contact's shop password, remove a contact, and read
what that customer and the ops team have done to their account — without the
create button being a grey afterthought beside *Upload PO*.

**Architecture:** A second section in the existing `(admin)` shell, reached
from a two-tab nav: `/admin/customers` (a lean management table),
`/admin/customers/new` (the existing `CustomerForm`) and
`/admin/customers/[id]` (the existing `BuyerDetailsCard` and
`BuyerContactsCard`, plus a new activity timeline and a danger zone). Three new
Server Actions, one new table (`AuditEvent`) written inside every customer
mutation and on every successful client sign-in, and one merge query that
reads four sources into a single timeline.

**Tech Stack:** As the portal: Next.js 16 App Router, Prisma 7 on Neon, Server
Actions, Zod 4, Vitest. Nothing new.

**Spec:** this file. Read `docs/specs/09-admin.md` (the admin shell, its guard
and the `UsersTable`/`UserDrawer` pattern this mirrors),
`docs/specs/23-customer-profiles.md` (what a customer *is*: `Buyer` +
`CLIENT` users; `username` is never a credential; what must never leak),
`docs/specs/15-client-accounts.md` §1–2 and `docs/specs/00-master.md` §4.

**Branch:** `feature/admin-customers`. Depends on 09, 15, 23 and 24 (all on
`main` or merged before this starts). Independent of the 18–22 storefront
sequence.

## Global constraints

- **Super admin only, twice.** The `(admin)` layout and `src/proxy.ts` already
  404 everyone else; every new action calls `requireSuperAdmin()` anyway.
- **A customer's shop never learns any of this exists.** Nothing in this
  phase touches a shop-facing `select`; `shop-viewer.test.ts`'s equality
  assertion on `select.buyer` must still pass untouched.
- **Nothing secret in the audit trail.** `AuditEvent.detail` carries field
  *names*, counts and references — never a password, temporary or otherwise,
  never the value of `remark`, never an email body.
- **Deletes are refused, not cascaded, wherever an order references the row.**
  A `PurchaseOrder`, `WebOrder` or `PoStageEvent` must never point at a
  buyer or contact that no longer exists. See §4.
- All UI through the `@theme` tokens in `src/app/globals.css`. No raw hex, no
  px font size, no arbitrary Tailwind value. Sentence-case labels. 44px touch
  targets below `sm`. No horizontal overflow at 390/768/1440.
- TypeScript strict, no `any`. Every Server Action returns
  `{ success, data, error }`. Every write path has a test that fails before
  the code exists.

---

## 0. Why this exists

Phase 23 built the pieces — `/buyers/new`, an edit sheet, an invite flow — and
scattered them. Creating a customer is a `secondary` button squeezed beside
*Upload PO* in the Buyers header (`src/app/(portal)/buyers/page.tsx:62-70`),
rendered only for a super admin and styled as the lesser of two actions on a
page whose job is analytics. Deleting a customer does not exist. Resetting a
contact's password exists only as *Resend*, a word that means "invite" and
that a super admin would not think to click for a customer who has been
signed in for a year. And nothing tells a super admin what happened to an
account: who reset it, when the customer last signed in, whether the failed
sign-ins were theirs.

The admin shell already has the shape for this — `UsersTable` and
`UserDrawer` are exactly "manage a kind of account from one page" — and the
user chose it over piling more controls onto the buyer analytics page.

## 1. Routes and shell

**`src/components/admin/AdminNav.tsx`** — a tab strip rendered by the admin
layout under its header: **Users** (`/admin`) · **Customers**
(`/admin/customers`). Real `<Link>`s carrying `aria-current="page"` on the
active tab (`/admin` matches exactly; `/admin/customers` matches by prefix),
`LinkSpinner` on each. It sits inside `NavProgressProvider`, so a click gets
the same top bar every other navigation does.

**Routes**, all under `src/app/(admin)/admin/customers/`, each with a
`loading.tsx` built from the `Skeletons` kit:

| Route | Renders |
|---|---|
| `/admin/customers` | §2 — the table and the primary **New customer** |
| `/admin/customers/new` | the existing `CustomerForm` with `afterCreate="/admin/customers"` (§7) |
| `/admin/customers/[id]` | §3 — detail; `notFound()` for an unknown id |

The proxy's `/admin` prefix rule already 404s these for anyone who is not a
super admin; no proxy change.

## 2. The customers table — `/admin/customers`

Eyebrow "Directory", h1 "Customers", and one CTA in the header: the primary
ink pill **New customer** (`<Button asChild><Link href="/admin/customers/new">`).
Nothing else in the header — it is the one thing the page is for.

**`src/lib/queries/admin-customers.ts`** — `listCustomers()` is a lean
`prisma.buyer.findMany` with `_count: { purchaseOrders, webOrders }` and
`contacts: { select: { disabledAt, mustChangePassword, lastActiveAt } }`.
It reads nothing from `listBuyers` (`src/lib/queries/buyers.ts`), whose
analytics cost 2.1 s once (2026-09-06) and answer a different question.
Shaping — search, status filter, sort — happens in memory in
`selectCustomers(rows, { q, sort })` exactly as `selectUsers` does, because
the roster is small (11 in development, a few dozen in production) and one
round trip is cheaper than three.

**Columns** (`DataTable`, card mode below `md`, first cell links to the row):

| Column | Value | Sort |
|---|---|---|
| Customer | name; `contactName` beneath in caption | name |
| Shop logins | `2 active · 1 invited`, `1 disabled`, or "None" | — |
| Last active | max `lastActiveAt` across contacts, `formatDate`, or "Never" | lastActive |
| Orders | `_count.purchaseOrders + _count.webOrders` | orders |
| Since | `formatDate(createdAt)` | createdAt |

Search (`?q=`) matches name, `contactName`, `email` and any contact's name or
email, case-insensitive. Sort via `parseSort` with `CUSTOMER_SORT_KEYS`.
Default sort: name ascending. Empty state: "No customers yet" and the same
**New customer** link.

## 3. The customer page — `/admin/customers/[id]`

`BackLink` to `/admin/customers`, eyebrow "Customer", h1 = buyer name, then:

**Row one — `lg:grid-cols-2`:**

- **Details** — `BuyerDetailsCard` (`src/components/buyers/BuyerDetailsCard.tsx`)
  with `canRename`. Unchanged.
- **Shop contacts** — `BuyerContactsCard` (`src/components/buyers/BuyerContactsCard.tsx`),
  changed as follows and *only* as follows:
  - The row of `secondary` buttons per contact (Resend · Disable · Edit) becomes
    one overflow menu per contact (`DropdownMenu`, trigger an icon-only
    `MoreHorizontal` button at 44px below `sm`, `aria-label="Actions for
    {name}"`): **Edit** · **Reset password** · **Resend invite** (only while
    `invited`, i.e. `mustChangePassword && !disabledAt`) · **Disable** /
    **Restore** · **Remove** (destructive style, last, separated).
  - **Reset password** opens a `Dialog`: "Email a temporary password to
    *siti@buyer.com*? They will have to choose a new one when they next sign
    in, and every device they are signed in on will be signed out." Confirm
    calls `resetClientPassword` (§4). The toast reports what actually
    happened: "Temporary password emailed to siti@buyer.com" when
    `data.sent`, otherwise "Password was reset but the email didn't send —
    try Reset password again."
  - **Remove** opens a `Dialog` naming the contact. If the action refuses
    (§4), the dialog shows the reason in place ("Siti placed 3 shop orders,
    so their account stays. Disable it instead.") with a **Disable instead**
    button that calls `setClientAccess(id, false)`.
  - The inline edit form (name, username, phone) is unchanged.
  The card is the same component on `/buyers/[id]`, so the portal gets these
  actions for free; that is intended.

**Row two — full width: `CustomerActivity`** (§6).

**Row three — full width: `DangerZone`** (`src/components/admin/DeleteCustomer.tsx`).
A bordered card, eyebrow "Danger zone", one line of copy and a `destructive`
**Delete customer** button.

- When `purchaseOrders + webOrders > 0` the button is `disabled` and the copy
  says why, with real numbers: "14 purchase orders and 2 shop orders
  reference this customer, so it can't be deleted. Disable their shop
  contacts instead." The counts come from the page's own load, so they are
  right on first paint.
- Otherwise the button opens a `Dialog` that requires typing the buyer's name
  exactly (case-insensitive, trimmed — the `deleteUser` rule) before
  **Delete** enables; the copy names what goes: "This removes Kim's Mart and
  its 2 shop contacts. There are no orders to lose." Success toasts and
  `push("/admin/customers")`.

**`/buyers/[id]`** (portal) gains, for a super admin only, a caption-sized
link beside the title: "Manage in Admin ›" → `/admin/customers/[id]`. Nothing
else on that page changes.

## 4. Actions

New actions live in `src/actions/customers.ts` beside `createCustomer`;
contact-level ones in `src/actions/clients.ts` beside their siblings. All:
`requireSuperAdmin()` first; Zod-parse every id (`z.string().min(1)`); return
`ActionResult`; on success `revalidatePath` for `/admin/customers`,
`/admin/customers/[id]`, `/buyers` and `/buyers/[id]`.

### `resetClientPassword(contactId)` → `ActionResult<{ sent: boolean }>`

The mechanics of `resendClientInvite` — `temporaryPassword()`, `hashPassword`,
`passwordChangedAt: now`, `mustChangePassword: true`, `sessionVersion:
{ increment: 1 }`, `sendInviteEmail` — under their own name. Refuses a
non-`CLIENT` or missing user ("That contact is gone."). Returns
`sendInviteEmail`'s own `sent` (the Phase 23 fix), never a hard-coded `true`.
Writes `PASSWORD_RESET`. **`resendClientInvite` becomes a one-line alias
that calls this and writes `INVITE_RESENT` instead** — two names, one
implementation, so they cannot drift.

### `removeBuyerContact(contactId)` → `ActionResult`

Refuses unless the user exists, is a `CLIENT`, and
`prisma.webOrder.count({ where: { placedById } }) === 0`; the refusal
message carries the count ("Siti placed 3 shop orders, so their account
stays. Disable it instead."). Otherwise one transaction: write
`CONTACT_REMOVED` (with `subjectUserId: null` and `{ name, email }` in
`detail`, since the row is about to go), then `user.delete` — `Account` and
`PasswordResetToken` cascade already. `LoginAttempt` rows are
keyed by email and are not touched.

### `deleteBuyer(buyerId, confirmName)` → `ActionResult`

Refuses unless `confirmName` matches the buyer name (case-insensitive,
trimmed) and both `purchaseOrder.count` and `webOrder.count` for the buyer
are zero; the refusal names the counts. Otherwise one transaction:

1. `auditEvent.create` — `CUSTOMER_DELETED`, `buyerId: null`,
   `detail: { name, contacts: n }`. Written first so the buyer's other events
   keep their `buyerId` until the `SetNull` fires — ordering does not matter
   for correctness, but writing before deleting keeps the event and the
   delete in one failure domain.
2. `user.deleteMany({ where: { buyerId } })` — every contact; §4's web-order
   rule is already satisfied because the buyer has zero web orders.
3. `buyer.delete`.

### Audit writes in existing actions

`createCustomer` → `CUSTOMER_CREATED` (`detail: { withContact: boolean }`);
`updateBuyer` → `CUSTOMER_UPDATED` (`detail: { fields: [...changed keys] }`,
computed by comparing the parsed patch against the current row — an
unchanged field is not a change); `inviteBuyerContact` → `CONTACT_INVITED`;
`updateBuyerContact` → `CONTACT_UPDATED` (`fields`); `setClientAccess` →
`CONTACT_DISABLED` / `CONTACT_RESTORED`. Each write goes **inside the
existing transaction** where there is one, or in a `$transaction([...])` with
the update where there is not, so an action can never succeed without its
event or vice versa.

`src/lib/audit.ts` exports `audit(tx, event)` — a thin typed wrapper over
`tx.auditEvent.create` taking `Prisma.TransactionClient | PrismaClient`, so
call sites read the same inside and outside a transaction — and the
`AuditDetail` types per action.

## 5. Data model

One migration, `audit_events`:

```prisma
enum AuditAction {
  CUSTOMER_CREATED
  CUSTOMER_UPDATED
  CUSTOMER_DELETED
  CONTACT_INVITED
  CONTACT_UPDATED
  CONTACT_REMOVED
  CONTACT_DISABLED
  CONTACT_RESTORED
  PASSWORD_RESET
  INVITE_RESENT
  SIGNED_IN
}

/// Who did what to a customer's account, and when a customer signed in.
/// Detail never holds a password, a temporary password, or the value of
/// `Buyer.remark` — field names, counts and references only.
model AuditEvent {
  id            String      @id @default(cuid())
  action        AuditAction
  /// Null = the system (a sign-in is recorded with the contact as actor).
  actorId       String?
  actor         User?       @relation("auditActor", fields: [actorId], references: [id], onDelete: SetNull)
  /// SetNull, not Cascade: the trail outlives the customer.
  buyerId       String?
  buyer         Buyer?      @relation(fields: [buyerId], references: [id], onDelete: SetNull)
  /// The contact acted on, where there is one.
  subjectUserId String?
  subjectUser   User?       @relation("auditSubject", fields: [subjectUserId], references: [id], onDelete: SetNull)
  detail        Json?
  at            DateTime    @default(now())

  @@index([buyerId, at])
  @@index([actorId, at])
}
```

`User` gains `auditActions AuditEvent[] @relation("auditActor")` and
`auditSubjects AuditEvent[] @relation("auditSubject")`; `Buyer` gains
`auditEvents AuditEvent[]`.

**The finding that shaped this.** `LoginAttempt` is rate-limit data: it is
swept after **24 hours** (`src/lib/rate-limit.ts:12`,
`ATTEMPT_RETENTION_HOURS = 24`). It cannot be a sign-in history, and
`lastActiveAt` is one timestamp. So the history is written where a sign-in
is decided: `authorize` in `src/lib/auth.ts` writes one `SIGNED_IN` event
(actor = the contact, `buyerId` = their buyer) on every successful
**`CLIENT`** credentials sign-in, after the existing `recordAttempt(...,
true)` and outside the request's critical path the way `lastActiveAt` is
(a failed write is logged, never a failed sign-in). Ops sign-ins are not
recorded: this is a customer account trail, not staff surveillance, and
`docs/specs/09-admin.md` did not ask for one.

**Retention:** none in this phase. The table grows by one row per client
sign-in and per admin action; at this customer's scale that is hundreds a
year. Recorded in §8 as the thing to revisit if it ever is not.

## 6. The activity timeline

**`src/lib/queries/customer-activity.ts`** — `loadCustomerActivity(buyerId,
{ page, kind })` reads four sources, each bounded to `take: page * 20`
ordered by its own timestamp descending, and hands them to a pure
`mergeActivity(sources): ActivityEntry[]` that sorts by time and slices the
page. The pure function is what the unit tests exercise.

| Source | Where | Becomes |
|---|---|---|
| `AuditEvent` | `buyerId` | "Aisha Rahman reset Siti's password" · "Chris Lam edited phone, remark" · "Siti signed in" · "Chris Lam created this customer" |
| `WebOrder` | `buyerId`, `status !== DRAFT` | "Siti placed WEB-0042 · RM 1,926.50 · Confirmed" → `/web-orders/[id]` (the review screen) |
| `PurchaseOrder` | `buyerId` | "PO-2025-0001 confirmed · RM 40,944.62 · from the shop / uploaded by Aisha" → `/purchase-orders/[id]` |
| `PoStageEvent` (`kind = STAGE`) | via `purchaseOrder.buyerId` | "PO-2025-0001 → Delivering · by Chris Lam" → the PO |
| `LoginAttempt` (`success = false`) | `email in contactEmails` | "Failed sign-in for siti@buyer.com" — grouped under a "Last 24 hours" caption, because that is all that exists |

```ts
type ActivityEntry = {
  id: string;            // `${source}:${rowId}`
  kind: "sign-in" | "shop-order" | "purchase-order" | "change";
  at: Date;
  text: string;          // already composed — the component only renders
  actor?: { name: string; image: string | null } | null;
  href?: string;
};
```

**`src/components/admin/CustomerActivity.tsx`** — eyebrow "Activity", filter
chips **All · Sign-ins · Shop orders · Purchase orders · Changes**
(`SegmentGroup`, `?kind=`, through `useUrlNavigation`), a list of entries
(`PersonChip` where there is an actor, `formatDateTime`, the text, the link),
`TablePagination` at 20 (`?page=`), and an empty state per kind ("No sign-ins
yet" …). Failed sign-ins render only under **All** and **Sign-ins**, after a
caption "Failed sign-ins are kept for 24 hours".

`ActivityEntry.text` is composed on the server from names that exist at read
time; a removed contact's `CONTACT_REMOVED` event reads its name from
`detail`, which is why §4 stores it there.

## 7. `/buyers`, `/buyers/new` and `CustomerForm`

- `src/app/(portal)/buyers/page.tsx` — for a super admin, **New customer** is
  the primary ink pill and `UploadPoButton` takes `variant="secondary"`; for a
  member, unchanged (Upload PO stays primary and alone).
- `src/components/portal/UploadPoButton.tsx` — gains an optional
  `variant?: "secondary"` prop passed straight to `Button`. Every other call
  site is untouched.
- `src/components/buyers/CustomerForm.tsx` — gains `afterCreate: string`
  (required, no default: a caller must say where it is). `/buyers/new` passes
  `/buyers`, `/admin/customers/new` passes `/admin/customers`; on success the
  form pushes `${afterCreate}/${buyerId}`.

## 8. Acceptance criteria

1. A super admin sees **Users · Customers** tabs on `/admin`; a member
   requesting `/admin/customers` or `/admin/customers/<id>` gets the same 404
   `/admin` already returns, read off the wire.
2. `/admin/customers` lists every buyer with logins, last active, orders and
   since, sorted and searched through the URL; **New customer** is the ink
   pill and creates a customer that lands on `/admin/customers/[id]`.
3. **Reset password** emails a temporary password, forces a change on next
   sign-in and ends existing sessions — proven by a client's live session
   being refused after the reset, and the toast matching the `sent` value
   read from the action's return, not assumed.
4. **Remove** deletes a contact with no web orders and refuses, naming the
   count, one who has any; the refusal offers Disable and Disable works from
   there.
5. **Delete customer** is disabled with real counts when orders exist, and
   deletes buyer + contacts in one transaction when none do; `buyer.count`
   and `user.count({ role: CLIENT })` measured before and after.
6. The activity timeline shows a `SIGNED_IN` entry within one page load of a
   client signing in on the shop host, and a `PASSWORD_RESET` entry naming
   the super admin who did it; the audit row's `detail` contains no password.
7. Every existing customer action (`createCustomer`, `updateBuyer`,
   `inviteBuyerContact`, `updateBuyerContact`, `setClientAccess`,
   `resendClientInvite`) writes exactly one `AuditEvent` in the same
   transaction — pinned by tests that fail if the write is removed.
8. `shop-viewer.test.ts` is unchanged and passes; no shop query's `select`
   widened.
9. Zero horizontal overflow on the three new routes and on `/buyers` at
   390/768/1440; no sub-44px control in the contact overflow menu or the
   danger zone at 390.
10. `tsc`, lint (no new warnings), build and the full test suite pass; all
    test data removed and counted.

## 9. Out of scope, stated

- **Editing a contact's email.** It is the credential; changing it silently
  is an account-takeover path. Remove and re-invite is the honest route.
- **Clients in the Users admin.** Phase 15 excluded them on purpose.
- **Archive / soft-delete of a buyer.** Refused-when-referenced needs no
  column and hides nothing from analytics.
- **Audit retention or export.** §5.
- **Ops sign-in history.** §5.
- **A canvas artboard.** None exists for Admin › Customers; this follows the
  admin shell's own visuals and is recorded as a deviation the way
  `/products/new` was (2026-09-08). The Phase 24 note — `/admin/settings`
  earns a page when a third kind of setting arrives — is unaffected; the
  Contact details card stays on Users.
