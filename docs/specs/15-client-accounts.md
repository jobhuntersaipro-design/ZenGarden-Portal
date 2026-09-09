# Phase 15 — Client accounts

Branch `feature/client-accounts`. Depends on: 02 (Auth.js, the proxy, the
password emails), 07 (buyer detail), 09 (the admin user drawer).

Goal: a buyer's own staff can sign in, on their own host, seeing only their own
company — without any of the 60-odd existing ops queries learning what a tenant
is.

## 0. Why this exists

The portal has exactly one audience. `User` is ops staff, `Buyer` is a customer
name on a purchase order, and **nothing links them**. Every query is unscoped by
design: any signed-in user sees every buyer, every PO and every product, and
`00-master.md` §1 says so on purpose — *"Internal ops staff, one org."*

Phase 16 puts a storefront on `shop.lovinghandsportal.com`. Before a single
product can be shown there, the app has to be able to answer a question it has
never been asked: **who is this person, and which buyer are they?**

This phase answers it, and does so in a way that leaves the existing 60 unscoped
queries correct rather than quietly wrong.

## 1. Data model

```prisma
enum Role { SUPER_ADMIN  MEMBER  CLIENT }

model User {
  // …existing…
  buyerId String?
  buyer   Buyer?  @relation(fields: [buyerId], references: [id])
  @@index([buyerId])
}

model Buyer {
  // …existing…
  contacts User[]
}
```

A client is a `User` row, not a parallel table. That is what lets the invite
reuse `createUser`, the Credentials provider, `bcrypt`, `mustChangePassword`,
`sessionVersion` and the whole password-reset flow instead of forking all of it.

### Why the role, and not `buyerId` alone

Marking a client only by having a `buyerId`, leaving `Role` untouched, **fails
open**. `role` defaults to `MEMBER`, so a client row that ever lost its
`buyerId` — a bad migration, a hand-edit, a bug — would silently become an ops
member with unscoped access to every buyer's orders. The enum fails closed: a
`CLIENT` with no buyer can do nothing at all.

Back the invariant in SQL, since Prisma cannot express it:

```sql
ALTER TABLE "User" ADD CONSTRAINT "User_client_has_buyer"
  CHECK ("role" <> 'CLIENT' OR "buyerId" IS NOT NULL);
```

One thing comes free: `userRoleSchema` (`src/lib/validation/users.ts:5`) is
already `z.enum([MEMBER, SUPER_ADMIN])`, so the admin drawer cannot mint a
client or promote one to staff without a deliberate edit.

### Two migrations, not one

`ALTER TYPE "Role" ADD VALUE 'CLIENT'` and the `CHECK` constraint that spells
`'CLIENT'` **must be separate migration files**. Prisma wraps each migration in
a transaction, and Postgres refuses to *reference* a newly added enum value in
the transaction that added it. A single file passes `migrate dev` on a database
where the value already exists and then fails `migrate deploy` in production,
after the enum has already been committed — the worst possible place to find
out.

## 2. `requireUser()` changes meaning

Adding a role to a codebase where every query is unscoped sounds like auditing
every surface. It is not, if you move the choke point instead of the call sites.

`requireUser()` (`src/lib/auth-guards.ts:43`) is already called by every Server
Action guard and every route handler in the app, and **every one of them means
"an ops person"** — they were all written when that was the only kind of user.

So `requireUser()` stops meaning "signed in" and starts meaning "signed-in
staff". Every existing action and route becomes client-proof with no edit, and
any code written later that forgets clients exist fails closed rather than open.

```ts
export type SessionUser = { …; buyerId: string | null };

export const isStaff = (role: Role) => role !== Role.CLIENT;

/** Any signed-in account, client included. Only for genuinely self-scoped work. */
export async function requireAccount(): Promise<SessionUser>;

/** An ops user. Throws for CLIENT — see above. */
export async function requireUser(): Promise<SessionUser>;

/** Unchanged. */
export async function requireSuperAdmin(): Promise<SessionUser>;

/**
 * A client, with the buyer they act for. Re-reads the row rather than trusting
 * the token: the JWT refreshes on a 5-minute interval (src/lib/auth.ts:19), and
 * revoking a client or moving them to another buyer has to take effect now, not
 * within five minutes. One lookup by primary key — the same trade
 * src/app/(portal)/layout.tsx:31 already makes for the sidebar.
 */
export async function requireClient(): Promise<SessionUser & { buyerId: string }>;
```

**Exactly one existing caller must move to `requireAccount()`:** `changePassword`
in `src/actions/auth.ts`. A client arrives with `mustChangePassword` set and has
to be able to clear it.

Deliberately left on `requireUser()`, so clients cannot reach them:
`src/actions/profile.ts` and `/api/avatars` — clients get no settings screen in
this phase — and `src/app/api/documents/[documentId]/url/route.ts`, which is
discussed in §7.

`buyerId` also rides in the JWT so the proxy can route on it without importing
Prisma. Staleness is acceptable *there* because routing is defence in depth; the
permission is `requireClient()`, which reads the row.

## 3. Two hosts, one app

A route group cannot vary by host, and a storefront `page.tsx` would collide
with `(portal)/page.tsx` at `/` — a build error. So the storefront lives at
**real paths under `/shop`** (built in Phase 16) and the shop host rewrites into
them. This phase builds the routing; Phase 16 builds what it points at.

```
/api/auth/*                        → next()                      (first, unchanged)
── shop host ────────────────────────────────────────────────────────────────
  PUBLIC_PATHS + /account/password → next()                      (shared, unprefixed)
  no session                       → /signin?next=…
  mustChangePassword               → /account/password
  role !== CLIENT                  → redirect to APP_URL          (§3.2)
  otherwise                        → rewrite /x → /shop/x
── portal host ──────────────────────────────────────────────────────────────
  /shop*                           → rewrite /not-found, 404      (mirrors /admin)
  role === CLIENT                  → redirect to SHOP_URL
  everything else                  → as today
```

`/shop*` returning a pinned 404 on the portal host copies the `/admin` treatment
at `src/proxy.ts:58-65` deliberately, status pin included: an unmatched rewrite
can otherwise stream as 200, and a scanner reading status codes would still tell
a real route from a fake one.

### 3.1 The proxy reads `process.env`, not `src/lib/env.ts`

`env.ts` parses its whole schema at import and **throws** on a bad key. The proxy
runs on every request on both hosts, so a Zod failure there would 500 the entire
application rather than one route. The proxy's design note
(`src/proxy.ts:6-16`) already says it imports nothing heavy; this is the same
rule.

`SHOP_HOST` and `SHOP_URL` are **optional** in `env.ts`. Unset means "one host,
everything is the portal", which is exactly right for `npm run dev` and for every
preview deployment, which have a single hostname. Locally, `shop.localhost:3000`
resolves to 127.0.0.1 in Chrome and Safari with no `/etc/hosts` edit.

### 3.2 An ops user on the shop host is redirected, not accommodated

A `MEMBER` has no `buyerId`, so a cart and an order list have no buyer to scope
to. Allowing the half-state means every storefront page grows a "staff viewing"
branch. One rule instead, and every page under the storefront may assume
`requireClient()` succeeded. *Preview the shop as a client* is a real want and is
explicitly out of scope.

### 3.3 Two link traps, both routed through one module

Because the shop host rewrites `/cart` → `/shop/cart`:

1. Every `<Link>` in storefront code is **browser-relative** — `/cart`, never
   `/shop/cart`, or a client on the shop host lands on `/shop/shop/cart`.
2. Every `revalidatePath` in a storefront Server Action must name the **real**
   path — `/shop/cart` — because revalidation keys on the resolved route, not on
   the URL the browser asked for.

They are opposites, which is exactly why neither may be hand-written. A new
`src/lib/shop-routes.ts` exports `shopHref.*` for the first and
`SHOP_ROUTE_PREFIX` for the second, and the rule goes in the storefront layout's
doc comment where the next reader will find it.

## 4. One sign-in page, two audiences

`/signin` stays shared and `PUBLIC_PATHS` is unchanged — those paths and
`/account/password` are host-agnostic and must work on both.

The page branches on the host read from `headers()`: a different title and
subtitle, and a new `showGoogle` prop on `SignInForm`. The Google block and its
"Use Continue with Google to request access" footnote
(`src/components/auth/SignInForm.tsx:116-127`) render unconditionally today;
on the shop they must not, because a client cannot get in that way.

`ERRORS` in `src/app/(auth)/signin/page.tsx:20` gains
`use_password: "Use your email and password to sign in."`

### Google must never reach a client account

`resolveGoogleSignIn` (`src/lib/auth-access.ts:34-40`) gains one branch before
the existing-active-user case:

```ts
if (existing.role === Role.CLIENT) return "/signin?error=use_password";
```

`allowDangerousEmailAccountLinking` is on (`src/lib/auth.ts:64`) for a good
reason — an admin-created password user must be able to press Continue with
Google. Without this branch, a client whose invited address happens to be a
Google account could link it and **skip `mustChangePassword` entirely**.

The `AUTO_APPROVE_DOMAIN` branch keeps creating `MEMBER` rows and must not learn
about clients. Worth stating because it is a live hazard either way: a buyer
contact whose address sits on the auto-approve domain gets an *ops* account
today. `queueAccessRequest` is untouched — a stranger still queues and a super
admin still decides — and `approveAccessRequest` rejects `CLIENT`, since an
access request carries no buyer to attach.

> ⚠️ **Cookie scope is load-bearing and must be left alone.** Auth.js sets the
> session cookie host-only — no `Domain` attribute — so a shop session simply
> does not exist on the ops host, and vice versa. **Do not set
> `cookies.sessionToken.options.domain`.** Anyone who later does, to "make
> sign-in work across both", makes a `CLIENT` cookie valid on `www` with only the
> portal layout redirect and `requireUser()` between them and every buyer's data.
> This note also belongs in `docs/specs/02-auth.md`.

## 5. The invite

`src/actions/clients.ts` — `inviteBuyerContact`, `resendClientInvite`,
`disableClientContact`, all `requireSuperAdmin()`.

`inviteBuyerContact` is a thin wrapper over the existing creation path, not a
fork of it: generate the temporary password, create with `role: CLIENT`,
`buyerId`, `mustChangePassword: true`, and email it.

**`signInUrl` has to become an argument.** `src/actions/users.ts:110` hardcodes
`` `${env.APP_URL}/signin` `` — the *ops* host. Invite a client through that
unchanged and they receive a link to a portal that immediately redirects them
away. The call site passes `env.SHOP_URL` for a client.

`disableClientContact` sets `disabledAt` and bumps `sessionVersion`, which is
what the `jwt` callback already reads to end a live session
(`src/lib/auth.ts:164-167`). Revoking a contact takes effect within the refresh
interval without inventing anything.

UI: `src/components/buyers/BuyerContactsCard.tsx` on `/buyers/[id]`, beside
`BuyerDetailsCard`. Rows show name, email, last active and status, reusing
`PersonChip` and the Phase 09 status vocabulary — Pending and Invited as neutral
text in amber rings, distinct from the amber-text "Needs review" badge.

## 6. Tests

`src/lib/auth-guards.test.ts` is new and is the centre of this phase, because
the whole design rests on one function changing meaning:

| Caller | `MEMBER` | `SUPER_ADMIN` | `CLIENT` | `CLIENT`, `buyerId` null |
|---|---|---|---|---|
| `requireAccount` | ✓ | ✓ | ✓ | ✓ |
| `requireUser` | ✓ | ✓ | **throws** | throws |
| `requireSuperAdmin` | throws | ✓ | throws | throws |
| `requireClient` | throws | throws | ✓ | **throws** |

Plus: `resolveGoogleSignIn` returns `/signin?error=use_password` for an existing
`CLIENT` (extending `src/lib/auth.signIn.test.ts`); `AUTO_APPROVE_DOMAIN` never
creates a `CLIENT`; `approveAccessRequest` rejects the role;
`inviteBuyerContact` writes `role: CLIENT` **with** a `buyerId` and mails a link
to `SHOP_URL` rather than `APP_URL`; a duplicate email returns the existing
friendly P2002 message; a non-super-admin is refused.

## 7. Acceptance criteria

1. A super admin invites a contact from a buyer page; the email arrives and its
   link points at `SHOP_URL`.
2. That client signs in on the shop host, is forced through
   `/account/password`, and afterwards lands on the storefront root.
3. The same client on the portal host is redirected to the shop, and `/shop` on
   the portal host returns a genuine 404 to everyone.
4. An ops member on the shop host is redirected to the portal.
5. A client calling any ops Server Action or `/api/**` route is refused — spot
   checked against `advanceStage`, `updateProduct` and `/api/upload/presign`.
6. Google sign-in with that client's address is refused with "Use your email and
   password to sign in.", and no account is linked.
7. Disabling the contact ends their session within the refresh interval.
8. Every existing ops journey is unchanged: sign in, upload, review, confirm,
   advance a stage, edit a product.
9. `prisma migrate deploy` applies both migrations cleanly against a database
   that has never seen `CLIENT`.

## 8. Out of scope

- **The storefront itself.** Phase 16. This phase ships the identity and the
  routing; the shop host serves a placeholder until then.
- **Client self-registration.** Ops decides who sees trade prices. The
  `AccessRequest` queue stays an ops-only mechanism.
- **A client settings or avatar screen.** `src/actions/profile.ts` and
  `/api/avatars` stay `requireUser()`. Clients get password change and nothing
  else.
- **Preview the shop as a client.** Would reintroduce the half-state §3.2
  removes. Worth building later behind an explicit impersonation audit trail,
  which is its own phase.
- **More than one buyer per contact.** `buyerId` is singular. A group buying for
  two companies gets two accounts until someone asks otherwise.
- **Hardening `/api/documents/[documentId]/url`.** That route presigns a GET for
  *any* document for any caller passing `requireUser()`. It is contained by this
  phase — clients cannot reach it — but it has no ownership check and is one
  careless `requireAccount()` away from a cross-buyer document leak. Fix it in
  Phase 16, where clients start reading order data.
