# Phase 26 — Buyer management

**Goal:** The admin room is two rooms with honest names — **User management**
and **Buyer management** — and a super admin can, from either, put a
password-reset link in someone's inbox with one visible button. Creating a
buyer asks for the company and the person who will sign in, nothing more,
and that person always gets shop access. The screens move a little when they
arrive and when they are touched, without a new dependency.

**Architecture:** The existing `(admin)` shell, renamed and restyled.
`/admin/customers/*` moves to `/admin/buyers/*` (one permanent redirect keeps
old bookmarks working). One new Server Action, `sendPasswordResetLink`,
reuses the Phase 02 `PasswordResetToken` mechanics and the `PasswordReset`
email. One additive migration adds `RESET_LINK_SENT` to `AuditAction`. The
create form and action are rebuilt around **company + point of contact**, the
contact becoming the CLIENT user. Motion is CSS: `tw-animate-css` (already
installed) plus a handful of `@theme` animation tokens.

**Branch:** `feature/buyer-management`, from `main`. Depends on 09, 15, 23,
25 (all on `main`).

**Design source:** the Claude Design canvas has no admin artboards. These
screens are derived from the portal's own conventions (`00-master.md` §4,
`context/design-system.md`) and the Phase 25 layout. Recorded as a deviation,
as Phases 22–25 did.

## Global constraints

- Super admin only, twice: the `(admin)` layout and `src/proxy.ts` already
  404 everyone else; every new or renamed action calls `requireSuperAdmin()`.
- Nothing in this phase touches a shop-facing `select`; `shop-viewer.test.ts`
  must pass untouched.
- Nothing secret in the audit trail — never a token, never a password.
- No count-up on any number (removed on purpose, 2026-09-06). Motion is
  entrance, hover and transition only, and collapses to nothing under
  `prefers-reduced-motion`.
- Tokens only. No raw hex, px font size or arbitrary Tailwind value.
  Sentence-case labels. 44px touch targets below `sm`. No horizontal overflow
  at 390/768/1440.
- `{ success, data, error }` from every action. A write path has a test that
  fails before the code exists.

## 1. Rename

| Was | Becomes |
| --- | --- |
| Tab **Users** (`/admin`) | **User management** (`/admin`) |
| Tab **Customers** (`/admin/customers`) | **Buyer management** (`/admin/buyers`) |
| `/admin/customers/new`, `/admin/customers/[id]` | `/admin/buyers/new`, `/admin/buyers/[id]` |
| `CustomersTable`, `CustomerActivity`, `DeleteCustomer` | `BuyersTable`, `BuyerActivity`, `DeleteBuyer` |
| `CustomerForm` | `BuyerForm` |
| `src/actions/customers.ts` (`createCustomer`, `deleteBuyer`) | `src/actions/admin-buyers.ts` (`createBuyer`, `deleteBuyer`) |
| `src/lib/queries/admin-customers.ts`, `admin-customer-labels.ts` | `admin-buyers.ts`, `admin-buyer-labels.ts` |
| `customer-activity.ts`, `customer-activity-entries.ts` | `buyer-activity.ts`, `buyer-activity-entries.ts` |
| `customer-delete-message.ts` | `buyer-delete-message.ts` |
| `createCustomerSchema` | `createBuyerSchema` |

- Every visible "customer" in the admin room becomes "buyer": headings,
  buttons, toasts, dialog copy, the danger zone, activity sentences, page
  titles, empty states.
- `next.config.ts` gains one permanent redirect: `/admin/customers/:path*` →
  `/admin/buyers/:path*`.
- `revalidatePath("/admin/customers…")` in `buyers.ts` and `clients.ts` moves
  to the new paths.
- The portal's `/buyers/new` shares `BuyerForm`, so its title and breadcrumb
  read "New buyer". `/buyers` itself (the analytics roster) is unchanged
  except its button label, "New buyer".
- **Database enum values keep their `CUSTOMER_*` names.** Renaming a Postgres
  enum buys nothing a reader sees and costs a migration with a rewrite.

## 2. Reset link

**`sendPasswordResetLink(userId)`** in `src/actions/reset-links.ts`.

1. `requireSuperAdmin()`.
2. Load `{ id, name, email, role, buyerId, passwordHash, disabledAt }`.
   Refuse:
   - missing row → "That account is gone."
   - `passwordHash === null` → "They sign in with Google, so there is no
     password to reset."
   - `disabledAt` set → "Restore their access first."
3. Create a `PasswordResetToken` exactly as `requestPasswordReset` does
   (32 random bytes, sha256 stored, `RESET_TOKEN_TTL_MS`). No public
   rate-limit check — the caller is a super admin, and the public form's
   limit still counts these tokens against the same window.
4. **Await** `sendEmail` with the existing `PasswordReset` template. The
   `resetUrl` base is `SHOP_URL ?? APP_URL` for `role === CLIENT` and
   `APP_URL` otherwise. Return `{ success: true, data: { sent } }`.
5. Write `RESET_LINK_SENT` (`actorId`, `subjectUserId`, `buyerId` for a
   client, `detail: { name }`) after the token is created, before the send.
   The trail records that a link was issued, which is true whether or not
   Resend delivered it.

Timeline sentence: `${actor} sent ${subject} a password-reset link`.

**Where the button is:**

- `UsersTable`: the "Password" column becomes an **Actions** column holding a
  secondary pill **Send reset link** (disabled with a title for Google-only
  users, hidden for disabled users) and the existing **Edit**. The
  confirmation dialog stays; its Send button reports the real `sent`.
- `BuyerContactsCard`: each enabled contact row gets a secondary pill **Send
  reset link** beside the `⋯` menu. The menu keeps Edit · Resend invitation
  (invited only) · Disable/Restore · Remove. The old temporary-password
  **Reset password** item and `resetClientPassword` are removed;
  `issueTemporaryPassword` keeps one caller, `resendClientInvite`.

**Shop host:** a signed-in shop visitor opening `/reset-password/<token>` on
the shop host must get the reset page, not a `/shop/...` 404. `src/proxy.ts`
already exempts public paths; verify on the wire in both sessions states.

## 3. New buyer form

`BuyerForm` (`src/components/buyers/BuyerForm.tsx`), one screen:

1. **Company name** — the title-style input, required.
2. **Point of contact** — Name (required), Email (required), Phone
   (optional). Caption: "They get a shop login and an email with a temporary
   password."
3. **More details** — a `<details>`-style disclosure, closed by default,
   holding Delivery address, Payment terms and Remark (with the existing
   "only our team sees this" caption). Opening animates height.
4. **Create buyer** (pending label "Creating…").

`createBuyerSchema`:

```ts
{ name, contact: { name, email, phone }, address?, paymentTerms?, remark? }
```

`createBuyer`:

- Buyer row: `name`, `contactName`/`email`/`phone` = the POC,
  `address`/`paymentTerms`/`remark` from the disclosure.
- CLIENT user: `name`/`email`/`phone` = the POC, `username` =
  `usernameFromEmail(email, taken)` — the email's local part lower-cased,
  characters outside `[a-z0-9._-]` dropped, padded to three characters,
  truncated to 32, and suffixed `-2`, `-3`… until it is not in the buyer's
  existing set of usernames sharing that base (read inside the transaction).
- Audit `CUSTOMER_CREATED` with `{ withContact: true, name }`.
- After commit: `sendInviteEmail` always. Result
  `{ buyerId, invite: "sent" | "failed" }`. Toast: "Buyer created and
  invitation sent." / warning "Buyer created, but the invitation didn't
  send. Use Resend invitation on their page."

## 4. Look and motion

**Buyer management list**

- Header: eyebrow "Directory", h1 "Buyer management", a one-line summary
  beneath ("13 buyers · 4 with shop access"), the ink pill **New buyer**.
- Controls: the search box plus filter chips with counts — **All · With
  access · Awaiting first sign-in · No login** — through `?access=` and the
  existing `usePendingChoice`/`ChoiceButton` pill look.
- Rows: `PersonAvatar` monogram of the company name, name + POC beneath,
  **Shop access** as a status pill (Active / Invited / Disabled / None) via
  `UserStatusBadge`, Last active, Orders, Since. A trailing chevron fades in
  on hover.
- Users tab: h1 "User management"; otherwise the same table with the new
  Actions column.

**Buyer page**

- A hero card: large monogram, eyebrow "Buyer", name, meta line
  "Since 5 Sep 2026 · 63 purchase orders · 2 shop contacts", and a
  **View analytics** link to `/buyers/[id]`.
- Then the existing two cards, activity, danger zone.

**Motion** (all in `globals.css`, all `@media (prefers-reduced-motion:
reduce)` → `animation: none; transition: none`):

- `--animate-rise`: 320ms ease-out fade + 8px rise, `both`. Applied via a
  `Rise` wrapper with `--rise-delay` so rows/cards stagger by 30ms, capped at
  the 12th child.
- Tab indicator: the active tab's underline scales from the centre
  (`after:` pseudo, `transition-transform`).
- Rows: `transition-colors` tint plus the chevron's `opacity` transition.
- Cards: `hover:shadow-card` lift on the list's mobile cards.
- Disclosure: `grid-template-rows 0fr→1fr` transition on the form's More
  details.
- Dialogs, menus, sheets already animate through `tw-animate-css`.

## 5. Tests and proof

- `reset-links.test.ts`: refuses member; refuses Google-only; refuses
  disabled; client link uses `SHOP_URL`, staff link uses `APP_URL`; returns
  `sent: false` when `sendEmail` does; writes `RESET_LINK_SENT` with the
  subject and buyer.
- `username.test.ts`: derivation, sanitising, padding, collision suffixing.
- `admin-buyers.test.ts`: `createBuyer` writes buyer + CLIENT + audit in one
  transaction, always sends, reports `failed` honestly; `deleteBuyer` tests
  carried over.
- `admin-buyers` query test: `selectBuyers` access filter.
- `clients.test.ts`: `resetClientPassword` cases removed; `resendClientInvite`
  kept.
- Browser: create a buyer from `/admin/buyers/new`, receive the invite;
  send a reset link to that contact, open it on the shop host, set a new
  password, prove the old one is refused on the wire; send a reset link to a
  member; overflow sweep at 390/768/1440 on `/admin`, `/admin/buyers`,
  `/admin/buyers/new`, `/admin/buyers/[id]`; sub-44px probe at 390.
- `npm run build`, `tsc --noEmit`, `npm run lint`, full Vitest.

## 6. Acceptance criteria

1. Tabs read User management and Buyer management; `/admin/customers` and
   `/admin/customers/<id>` redirect permanently to `/admin/buyers…`.
2. No visible "customer" remains in the admin room.
3. A super admin can send a reset link to a member and to a buyer contact
   from a visible button; the toast says whether the email went out; the
   link works once, expires in 30 minutes, and lands a contact on the shop
   host.
4. A Google-only user's button explains why it is disabled; a disabled
   account is refused.
5. `RESET_LINK_SENT` appears in the buyer's activity timeline.
6. The new-buyer form has company name, POC name, email, phone, and a
   collapsed More details; creating one yields a Buyer and a CLIENT contact
   with a derived username and an invitation.
7. Rows and cards animate in and are static under reduced motion.
8. No overflow at 390/768/1440; no sub-44px control at 390 beyond the
   already-accepted classes.

## 7. What the build found (2026-09-14)

- **The post-reset redirect left the shop host.** `ResetPasswordForm` (and
  `ChangePasswordForm`) called `signOut({ redirectTo: "/signin?reset=1" })`,
  and Auth.js resolves `redirectTo` against its configured base URL — so a
  contact who opened the link on `shop.localhost` landed on the *portal's*
  sign-in (measured). Both forms now sign out with `redirect: false` and
  assign the relative path themselves, which keeps whichever host they are
  on. Pre-existing for the public forgot-password form too; fixed here
  because this phase is the first to send a contact that link on purpose.
- **A signed-in shop visitor does get the reset page.** `src/proxy.ts`
  already exempts public paths from the `/shop` rewrite; verified 200 with
  "Set a new password" while the contact held a live shop session.
- **The title input on the create form rendered at 14px.** The `Input`
  primitive's own `md:text-sm` outranked the form's `sm:` display size, so
  the company name sat squeezed with display-size tracking — inherited from
  Phase 23's form. A matching `md:` size is passed in and tailwind-merge
  drops the primitive's.
- **Two 390px defects in the new hero and the contact row**, both fixed:
  three flex siblings on one line broke the buyer's name one character per
  line (the hero now stacks below `sm`), and the reset pill plus the `⋯` menu
  squeezed a contact's name to a chip and "del…" (the info block is
  `basis-full` below `sm`, so the actions wrap under it). Keeping "Back to
  portal" on one line then pushed the admin header 26px past a 390px
  viewport, so the "Admin" eyebrow is hidden below `sm`.
- **`animate-rise` fills `backwards`, not `both`.** With `both`, the row kept
  an identity transform after the animation and became the containing block
  for its sticky first cell. Measured `transform: none` and `position:
  sticky` on a row after the fix.
- **Accepted, not fixed:** at 390px the activity segment "All" measures 39px
  wide (44px tall) — the compact segment look, as on every other segmented
  strip; and the card-mode title links stay the accepted plain-text class.
