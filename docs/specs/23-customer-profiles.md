# Phase 23 — Customer profiles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ops can create a customer from scratch — company details, a point of
contact, an internal remark, and a shop login — in one screen, and that customer
can change their password more than once.

**Architecture:** A customer is a `Buyer` (the company) plus zero or more
`CLIENT` `User` rows (its people), which is what Phase 15 already built. This
phase adds the front door that never existed, three columns, and the one menu
row that completes the invitation loop. No new table, no new role, no change to
how anybody authenticates.

**Tech Stack:** As the portal: Next.js 16 App Router, Prisma 7 on Neon,
Server Actions, Zod, Resend. Nothing new.

**Spec:** this file. Read `docs/specs/15-client-accounts.md` (§1, §2, §8),
`docs/specs/09-admin.md` (the user drawer's safety rules) and
`docs/specs/00-master.md` §4 (design conventions). Phase 21
(`docs/specs/design/shop/21-customer-settings.md`) is the customer's own
settings screen and stays out of scope here — see §9.

**Branch:** `feature/customer-profiles`. Depends on 15 (the CLIENT role and the
invite) and 07 (buyer detail). Independent of 18–22.

## Global constraints

- **`username` is a label, never a credential.** Nothing in the sign-in path
  may look it up. §2 pins this with a test, because the next person to read the
  column will assume otherwise.
- **`Buyer.remark` is internal and must never reach the shop.** Enforced by
  narrow `select`s asserted by equality, the way Phase 16 enforced it for
  `PurchaseOrder.notes` — not by remembering.
- Creating a customer is **super admin only**, matching the Phase 15 rule: these
  accounts see trade prices, so handing one out is not a Member's call. Members
  keep editing a buyer's contact details and remark, and keep being unable to
  rename a buyer.
- All UI through the `@theme` tokens in `src/app/globals.css`. Sentence-case
  labels, the ink pill for the primary CTA, 44px touch targets below `sm`. No
  raw hex, no px font size, no arbitrary Tailwind value.
- Every new Server Action returns `{ success, data, error }` and reports
  failures by toast.

---

## 0. Why this exists

Three gaps, each measured in the code rather than assumed.

**There is no way to create a customer.** A `Buyer` row comes into existence in
exactly two places: `tx.buyer.upsert` inside `writePurchaseOrder`
(`src/actions/purchase-orders.ts:381`) and `prisma/seed.ts:98`. So a customer
exists only after they have already sent a purchase order — which means the
shop invite on the buyer page can only be offered to companies that have
already bought something the old way. A new customer who is meant to *start* on
the shop cannot be entered at all.

**The invite captures two fields.** `inviteContactSchema`
(`src/lib/validation/clients.ts`) is `{ buyerId, name, email }`. There is
nowhere to record a username, a phone number, or a note about the account.
`Buyer` holds `contactName / email / phone / address / paymentTerms` and no
remark, and those are only reachable from a sheet buried in the buyer detail
card.

**A customer can change their password exactly once.** The forced first change
works (`src/app/(auth)/account/password/page.tsx`). Every change after it does
not: that page sends a non-forced user to `/settings#password`, `/settings` is
under `(portal)`, and the portal layout redirects a `CLIENT` straight back to
the shop host (`src/app/(portal)/layout.tsx:31`). The shop account menu
(`src/components/shop/ShopHeader.tsx:26-48`) offers *My orders*, *Talk to our
team* and *Sign out* — and nothing else. So the loop the invitation email opens
is never closed.

## 1. Data model

```prisma
model Buyer {
  // …existing…
  /// Internal note about this customer. Ops only — no shop query may select it.
  remark String?
}

model User {
  // …existing…
  /// A display handle, shown in ops and (from Phase 21) on the customer's own
  /// settings screen. NEVER an authentication identifier — see §2.
  username String? @unique
  /// The contact's own line. The company's address stays on `Buyer`.
  phone    String?
}
```

One migration, `prisma/migrations/20260911090000_customer_profiles/migration.sql`
— three `ADD COLUMN`s and one unique index. Unlike Phase 15 this needs no split:
no enum value is added, so nothing is referenced in the transaction that created
it.

Three decisions worth their reasons:

- **`username` is nullable and unique.** Postgres allows any number of NULLs
  under a unique index, so every existing ops user keeps a null and no backfill
  is needed. It is *required by the schema* when creating or inviting a customer
  contact, and that requirement lives in Zod (§2), not in SQL. A CHECK
  constraint is the right instrument for an invariant that fails open — which is
  why Phase 15 used one for `role <> 'CLIENT' OR buyerId IS NOT NULL` — and a
  missing display handle fails nothing.
- **`username` is stored lower-cased**, exactly as `emailSchema` stores
  addresses. Normalising on the way in is what makes a plain unique index
  sufficient; without it `Acme` and `acme` are two rows and the handle stops
  identifying anyone.
- **The remark is on `Buyer`, not on the contact.** It is a note about the
  customer, and a customer with three logins should not have the note on
  whichever one happened to be created first.

`BuyerDetail["buyer"]` and `loadBuyerDetail`'s `select`
(`src/lib/queries/buyer-detail.ts:60-71`) gain `remark`. `BuyerContact` and
`listBuyerContacts` (`src/lib/queries/clients.ts`) gain `username` and `phone`.

## 2. `username` is not a credential

`signInSchema` (`src/lib/validation/auth.ts`) stays `{ email, password }`. The
Credentials provider (`src/lib/auth.ts`) keeps its single `findUnique` by email.
`checkLoginAllowed` and `recordLoginAttempt` keep keying on email, and so does
the password-reset flow, which has nowhere to send a link otherwise.

Pin it with a test in `src/lib/validation/auth.test.ts`:
`signInSchema.safeParse({ username: "x", password: "y" })` fails, and the parsed
shape of a valid input has exactly the keys `["email", "password"]`. A test that
asserts an absence is unusual and deliberate — the column will read like a login
field to whoever meets it next, and this is the cheapest way to say it is not.

## 3. Validation

`src/lib/validation/clients.ts`:

```ts
/** `""` and whitespace become null, so a cleared field clears the column. */
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(z.string().max(max).nullable());

/** Optional, but a real address when it is there. See the note below. */
const optionalEmail = optionalText(200).pipe(
  z.union([z.null(), emailSchema]),
);

/** Lower-cased and trimmed before validation, exactly as `emailSchema` is. */
export const usernameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,31}$/,
      "Use 3–32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    ),
);

/** Free text: Malaysian numbers are written a dozen ways and we do not parse them. */
export const phoneSchema = optionalText(32);

export const inviteContactSchema = z.object({
  buyerId: z.string().min(1),
  name: z.string().min(1, "A name is required").max(120),
  email: emailSchema,
  username: usernameSchema,
  phone: phoneSchema,
});

export const contactPatchSchema = inviteContactSchema.pick({
  name: true,
  username: true,
  phone: true,
});
export type ContactPatch = z.infer<typeof contactPatchSchema>;

export const createCustomerSchema = z.object({
  company: z.object({
    name: z.string().min(1, "A customer needs a name").max(200),
    address: optionalText(500),
    paymentTerms: optionalText(120),
    remark: optionalText(2000),
    contactName: optionalText(120),
    email: optionalEmail,
    phone: phoneSchema,
  }),
  /** Omitted when the reader did not open "Give them a shop login". */
  contact: inviteContactSchema.omit({ buyerId: true }).optional(),
  sendInvite: z.boolean().default(true),
});
export type CreateCustomerInput = z.input<typeof createCustomerSchema>;
```

The company's email needs `optionalEmail` rather than `emailSchema`, which
rejects `""`: `Buyer.email` is a company inbox, not a login, so it may be blank —
but a typo in it must still be caught. The contact's email keeps `emailSchema`,
because that one *is* how the account is identified.

## 4. `createCustomer`

New file `src/actions/customers.ts`, sharing `temporaryPassword()`,
`clientSignInUrl()` and the `guard()` shape with `src/actions/clients.ts` by
lifting them into `src/lib/client-invites.ts`. `clients.ts` keeps
`inviteBuyerContact`, `resendClientInvite` and `setClientAccess` and gains
`updateBuyerContact`.

```ts
export async function createCustomer(
  input: CreateCustomerInput,
): Promise<ActionResult<{ buyerId: string; invite: "sent" | "failed" | "skipped" }>>;
```

1. `requireSuperAdmin()` through the existing `guard()`.
2. `createCustomerSchema.safeParse`; first issue's message on failure.
3. **Hash the temporary password before opening the transaction.** bcrypt at
   cost 12 takes a few hundred milliseconds, and spending that inside a
   transaction holds a Neon connection open for no reason.
4. `prisma.$transaction` — create the `Buyer`, then the `User`
   (`role: CLIENT`, `buyerId`, `mustChangePassword: true`,
   `passwordChangedAt: new Date()`) when a contact was given.
5. **Send the email after the transaction commits, never inside it.** A Resend
   outage must not roll back a customer the reader has just typed in. A failed
   send returns `success: true` with `invite: "failed"`, and the screen says
   "Customer created, but we couldn't send the invitation. Use Resend invite on
   their page." `invite: "skipped"` is the *Send the invitation email* box
   unchecked — a login that exists and will be handed over another way.
6. `revalidatePath("/buyers")`.

**Unique-constraint mapping.** The transaction rolls back as a whole, which is
correct: a username clash must not leave a half-made customer. `P2002` carries
the constraint in `meta.target`, so map it rather than guessing —
`Buyer_name_key` → "Another customer already has that name.",
`User_email_key` → "That email address is already in use.",
`User_username_key` → "That username is taken." A single generic message here
would send the reader hunting through six fields.

`inviteBuyerContact` takes the two new fields and writes them. `resendClientInvite`
is unchanged.

```ts
/** Name, username and phone. Not the email: that is how we identify the account. */
export async function updateBuyerContact(
  contactId: string,
  patch: ContactPatch,
): Promise<ActionResult>;
```

Super admin only; refuses a row whose `role` is not `CLIENT`, exactly as
`setClientAccess` does; maps `User_username_key`.

## 5. The screen — `/buyers/new`

`src/app/(portal)/buyers/new/page.tsx`, shaped like `/products/new`: a
`BackLink` with `fallbackHref="/buyers"`, a breadcrumb reading *Buyers / New
customer*, then the form. `getSessionUser()`; anything but `SUPER_ADMIN`
redirects to `/buyers` — the same reasoning the product page records, that a URL
can be typed and a member should meet the directory rather than a form that can
never save.

`src/components/buyers/CustomerForm.tsx` (client), `max-w-panel-lg`, three
groups under `h2` headings:

| Group | Fields |
|---|---|
| **Company** | Customer name (required) · Delivery address (textarea) · Payment terms · Remark (textarea, caption "Only our team sees this — it never appears on the shop.") |
| **Point of contact** | Name · Email · Phone |
| **Shop access** | Opened by a *Give them a shop login* toggle. Contact name · Username · Email · Phone · *Send the invitation email* (checked) |

Opening **Shop access** prefills its contact name, email and phone from the
point-of-contact fields if those are filled and the shop fields are still empty.
The reader is typing the same person twice otherwise, and it is only a prefill —
editing either afterwards does not re-sync them.

The username field carries the caption "They sign in with their email address;
this is just how we refer to them." — the one place a reader would otherwise
assume it is a credential.

Submit is the ink pill **Create customer**, `pending` while the action runs. On
success: `router.push(`/buyers/${buyerId}`)` and a toast keyed to `invite` —
"Customer created and invitation sent." / "Customer created." / the warning in
§4.5. On failure the typed values stay, as `/products/new` keeps them.

`/buyers`'s `PageHeader` action slot takes `<div className="flex gap-xs">` with
a **New customer** `<a href="/buyers/new">` styled as the ink pill beside the
existing `<UploadPoButton />`, rendered only for a super admin. A real anchor,
not a button with a router push, so cmd-click opens a tab — the reasoning
`/products/new` already recorded.

## 6. Editing afterwards

**`BuyerDetailsCard`** gains a Remark row and a Remark textarea in its edit
sheet. The row renders `whitespace-pre-wrap` and is omitted when null, like
every other optional row in that card. `buyerPatchSchema`
(`src/actions/buyers.ts`) gains `remark`; it stays editable by any ops member,
because it is a note rather than an identity, and the name stays super-admin
only.

**`BuyerContactsCard`**'s invite form gains Username and Phone inputs, and each
contact row gains an **Edit** button for a super admin, opening the three
`contactPatchSchema` fields inline above the row. The row's caption line grows
to `{username} · {email}`, with the phone on the next line when present. Today a
mistyped name is permanent, which is the whole reason for the button.

## 7. Closing the password gap

Two changes, no new screen.

**`src/app/(auth)/account/password/page.tsx`** — a non-forced `CLIENT` gets the
standalone `AuthCard` instead of `redirect("/settings#password")`. Staff
behaviour is untouched. The page is already served from the same path on both
hosts: `isShared()` in `src/proxy.ts:47` exempts `/account/password` from the
shop rewrite, so no proxy change is needed and none should be made.

**The shop account menu** gains a **Change password** row (`KeyRound`) above the
separator, `href: "/account/password"` — written as a literal, **not** through
`shopHref`. This is the exception `src/lib/shop-routes.ts`'s own comment implies:
its rule exists because storefront paths are rewritten under `/shop`, and this
path is on the shared list precisely so it is not.

`ChangePasswordForm` needs no change. Its non-forced branch already ends in
`signOut({ redirectTo: "/signin?reset=1" })`, and both that path and the shop's
own `/signin` resolve on the shop host — the customer is signed out everywhere
and signs back in with the new password, which is the behaviour ops staff
already get.

## 8. What must never leak

`Buyer.remark` is ops-only. **A shop page reads a `Buyer` in exactly one
place** — `loadShopViewer` (`src/lib/shop-viewer.ts:24`), whose
`buyer: { select: { name: true } }` supplies the company name in the shop
header and account menu, and which runs in the storefront layout on every shop
request. That select gains an equality assertion in
`src/lib/shop-viewer.test.ts`, so widening it is a deliberate edit rather than a
spread that quietly grew.

Two other buyer selects look like candidates and are not: `notifyOps`
(`src/actions/cart.ts:440`) composes an email **to ops staff**, and
`loadWebOrderForReview` (`src/lib/queries/web-orders.ts:284`) feeds the **ops**
review screen — which already selects `notes` on purpose. Neither renders to a
customer. The shop's own order queries, `listBuyerOrders` and `loadBuyerOrder`,
read no `Buyer` at all and already carry equality assertions and a `FORBIDDEN`
list in `src/lib/queries/web-orders.test.ts`; nothing there needs to change.

Phase 18's `loadReviewBuyer` and Phase 21's `loadClientBuyer` are the next two
shop-side buyer reads and inherit the same rule when they land.

`username` and `phone` are the customer's own facts, so they are free to appear
on the shop later. This phase renders them in ops only.

---

## 9. Tasks

### Task 1: Schema, migration and validation

**Files:** `prisma/schema.prisma`,
`prisma/migrations/20260911090000_customer_profiles/migration.sql`,
`src/lib/validation/clients.ts`, `src/lib/validation/clients.test.ts`,
`src/lib/validation/auth.test.ts`

- [ ] Failing tests: `usernameSchema` lower-cases and trims, accepts
      `acme.ops`, `a_1`, rejects `ab` (too short), `.acme` (leading dot),
      `acme ops` (space) and a 33-character handle; `phoneSchema` turns `"  "`
      into null and keeps `+60 12-345 6789`; `createCustomerSchema` accepts a
      company with no contact, rejects a contact missing a username, and lets
      the company email be `""` but not `"nope"`; the §2 absence test on
      `signInSchema`.
- [ ] Migration written by hand and applied with `migrate deploy` under a
      `timeout` — `migrate dev` has hung twice on this machine (2026-09-09) and
      also prompts in a way a non-TTY cannot answer. `migrate status` clean,
      client regenerated.
- [ ] FAIL → implement §1 and §3 → PASS. Commit
      `feat(db): a remark on a customer, a username and phone on their contacts`

### Task 2: `createCustomer` and the contact actions

**Files:** `src/lib/client-invites.ts`, `src/actions/customers.ts`,
`src/actions/customers.test.ts`, `src/actions/clients.ts`,
`src/actions/clients.test.ts`, `src/lib/queries/clients.ts`,
`src/lib/queries/buyer-detail.ts`, `src/actions/buyers.ts`

- [ ] Failing tests: a member is refused; a company with no contact creates a
      `Buyer` and zero `User` rows and returns `invite: "skipped"`; a full
      input creates both and sends one email whose `to` is the contact and whose
      props carry the shop sign-in URL; **a throwing `sendEmail` still returns
      `success: true` with `invite: "failed"` and leaves the buyer and contact
      in place**; a duplicate buyer name, email and username each return their
      own message and leave **zero** rows behind (count before and after);
      `sendInvite: false` creates the contact and sends nothing;
      `updateBuyerContact` refuses a non-CLIENT id and refuses a member.
- [ ] FAIL → implement §4 → PASS. Commit
      `feat(customers): create a customer, its contact and its invitation in one action`

### Task 3: The new-customer screen

**Files:** `src/app/(portal)/buyers/new/page.tsx`, `loading.tsx`,
`src/components/buyers/CustomerForm.tsx`,
`src/app/(portal)/buyers/page.tsx`

- [ ] Build §5.
- [ ] Browser as a super admin: create a customer with every field filled and
      a shop login → land on `/buyers/[id]` with the company rows, the remark
      and the contact all showing what was typed; the row appears on `/buyers`.
      Create a second with company fields only → no contact row, no email sent.
      A duplicate name → the named error with the typed values kept. As a
      member, `/buyers/new` redirects to `/buyers` and the button is absent.
- [ ] Commit `feat(customers): the new-customer screen`

### Task 4: Editing a customer afterwards

**Files:** `src/components/buyers/BuyerDetailsCard.tsx`,
`src/components/buyers/BuyerContactsCard.tsx`, `src/actions/buyers.ts`,
`src/actions/buyers.test.ts`

- [ ] Failing test: `buyerPatchSchema` accepts and trims `remark`; a member may
      patch it and may still not rename.
- [ ] Build §6. Browser: edit the remark → it renders with its line breaks and
      is absent when cleared; edit a contact's username → the caption updates;
      a clashing username → "That username is taken." and the old value intact.
- [ ] Commit `feat(customers): edit a customer's remark and its contacts`

### Task 5: A customer can change their password again

**Files:** `src/app/(auth)/account/password/page.tsx`,
`src/components/shop/ShopHeader.tsx`

- [ ] Build §7.
- [ ] Browser as a real customer, the whole loop in one sitting: receive the
      invitation → sign in on the shop host → forced change → **Change
      password** in the account menu → change it a second time → signed out →
      the second password signs in and **the first one does not**. Read the
      first failure from the wire, not from the toast.
- [ ] Confirm the staff path is unchanged: a member at `/account/password` with
      no forced flag still lands on `/settings#password`.
- [ ] Commit `feat(shop): a customer can change their password more than once`

### Task 6: Verification, cleanup and history

**Files:** `src/lib/shop-viewer.test.ts`, `context/current-feature.md`

- [ ] The §8 equality assertion on `loadShopViewer`'s buyer select.
- [ ] Full suite, `tsc`, `lint`, `build`. Sweep `/buyers`, `/buyers/new` and a
      buyer detail page at 390 / 768 / 1440 — `scrollWidth === innerWidth` on
      all nine, and no control under 44px at 390 that is not already an accepted
      exception.
- [ ] Remove every row created while testing: the customers, their contacts,
      their `LoginAttempt` rows. Report `Buyer` and `User` counts before and
      after. Nothing on production.
- [ ] `context/current-feature.md` entry: what was measured, what was not
      verified, and that Phase 21 still owns the customer's own settings screen.

## 10. Acceptance criteria

1. A super admin creates a customer from `/buyers/new` with company details, a
   point of contact, an internal remark and a shop login; the customer appears
   on `/buyers` and their detail page shows exactly what was typed.
2. The invitation arrives at the contact's address and signs them in on the shop
   host; a `sendEmail` failure leaves the customer created and says so.
3. A member cannot reach `/buyers/new`, cannot create a customer by calling the
   action directly, and can still edit a buyer's contact details and remark.
4. A duplicate customer name, contact email or username each return their own
   message and leave no partial rows behind.
5. Nothing in the sign-in path reads `username`; `signInSchema`'s parsed shape
   is still exactly `email` and `password`.
6. `Buyer.remark` appears nowhere on the shop, asserted by equality on every
   shop-side buyer `select`.
7. A customer changes their password from the shop account menu, after the
   forced first change, and the old password stops working.
8. Zero horizontal overflow at 390, 768 and 1440 on the three touched screens.

## 11. Out of scope

- **A customer editing their own company details** — Phase 21, by design: these
  are what we invoice and deliver against.
- **Username as a sign-in identifier** — §2, deliberately.
- **More than one company per contact** — unchanged from Phase 15 §8.
- **Bulk import of customers** — a script when there is a list to import.
- **A customer-facing profile screen showing the username** — Phase 21 renders
  it; this phase writes it.
- **Renaming the `/buyers` section to Customers** — the word "buyer" is the PO
  domain's, and a rename touches the sidebar, nine routes and every breadcrumb.
  The button and the new screen say *customer*; the section stays *Buyers*.
