# Phase 02 — Authentication and access

Branch `feature/auth`. Depends on: 01. Screens: design reference §3.1
(Sign in, Access requested), plus Forgot password, Reset password, Change
password (same card geometry as Sign in).

Goal: only approved users reach the portal; Google and password both work;
super admins are notified of access requests by email; passwords can be reset.
Run the `auth-auditor` agent before opening the PR and fix what it finds.

## 1. Auth.js configuration — `src/lib/auth.ts`

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/signin", error: "/signin" },
  providers: [Google({ allowDangerousEmailAccountLinking: true }), Credentials({ ... })],
  callbacks: { signIn, jwt, session },
});
```

- `allowDangerousEmailAccountLinking: true` is deliberate: an admin-created
  user with a password must be able to sign in with Google on the same email.
  Google verifies the email, so the usual risk does not apply. Document this in a code comment.
- **`signIn` callback**, Google branch: look up `User` by `profile.email`
  (lower-cased). Active → `true`. `disabledAt` set → `false` (lands on
  `/signin?error=disabled`). Not found → if `AUTO_APPROVE_DOMAIN` matches the
  email domain, create the user as MEMBER and return `true`; else upsert
  `AccessRequest` (name, image, `lastSeen`), send `AccessRequested` email to
  every SUPER_ADMIN (only on first creation, not on every retry), and return
  the string `/signin/pending?e=<base64url email>`. Declined request → return
  `/signin/pending?declined=1`. No session is created for the redirect cases.
- Credentials branch: `authorize` runs the rate limiter (§3), finds the user,
  rejects if disabled or `passwordHash` null, compares with `bcrypt.compare`,
  records a `LoginAttempt`, returns `{ id, email, name, image, role }`.
- **`jwt` callback**: on sign-in copy `id`, `role`, `mustChangePassword`,
  `sessionVersion` into the token. On every call where `trigger === "update"` or every 5 minutes
  (store `refreshedAt`), re-read `role`, `disabledAt`, `mustChangePassword`
  and `sessionVersion` from the database so a disabled or demoted user is cut
  off within 5 minutes. If disabled, or if the stored `sessionVersion` is
  higher than the token's, return `null` to end the session. Password changes
  and admin resets bump `sessionVersion`, which signs the user out everywhere.
- **`session` callback**: expose `session.user.{id, role, mustChangePassword}`.
  Augment the `next-auth` types in `src/types/next-auth.d.ts`.
- Update `User.lastActiveAt` at most once per 10 minutes from the `jwt` callback.

## 2. Route protection — `src/proxy.ts`

Runs on the Node runtime (Next 16 `proxy`, not `middleware`). Uses
`auth()` from Auth.js (JWT only, no Prisma import in this file).

| Path | Rule |
|---|---|
| `/signin`, `/signin/pending`, `/forgot-password`, `/reset-password/*`, `/api/auth/*` | public |
| `/account/password` | signed in |
| everything else | signed in, else redirect to `/signin?next=<path>` |
| `/admin`, `/admin/*` | signed in and `role === SUPER_ADMIN`, else **rewrite to `/not-found`** (404, never 403) |
| any page while `mustChangePassword` | redirect to `/account/password` except that page and sign-out |

`src/lib/auth-guards.ts` becomes real: `requireUser()` returns the session or
throws; `requireSuperAdmin()` additionally checks role. Every Server Action
and route handler calls one of them; the proxy is defence in depth, not the
only check.

## 3. Rate limiting — `src/lib/rate-limit.ts`

Database-backed (serverless has no shared memory). `checkLoginAllowed(email, ip)`
counts `LoginAttempt` rows with `success = false` in the last 15 minutes for
that email and for that IP; if either is ≥ 5, throw `TooManyAttempts`. The
sign-in form shows "Too many attempts. Try again in 15 minutes." Password
reset requests are limited to 3 per email per hour the same way. A nightly
cleanup is not needed; a `deleteMany` of rows older than 24 h runs
opportunistically on 1 in 50 calls.

## 4. Screens and actions

**Sign in `/signin`** (design reference §3.1). The card signposts its two
paths with quiet mono labels (`font-mono`, `text-ink-tertiary`, sentence
case — G3 casing applies here and to the Email and Password field labels,
which keep the mono family, size and tertiary colour but are no longer
uppercased): **Members** sits above the email field, **New here?** sits above
the Google button. Client form posts to the Credentials provider via
`signIn("credentials", { redirect: false })`; on error show the inline strip
"Wrong email or password." for any failure including unknown email. Google
button calls `signIn("google", { callbackUrl })`. The footer sentence sits
directly under the Google button, left-aligned (not centred at the foot of
the card), in `text-caption`, and reads exactly: "Use Continue with Google to
request access. An admin approves it."
`?error=disabled` shows "This account is disabled. Ask your admin."
`?next=` is honoured after sign-in when it is a same-origin path.

**Access requested `/signin/pending`**. Server component reads `?e=` to show
the email row, and `?declined=1` for the declined copy. "Use a different
account" calls `signOut` then `signIn("google", { prompt: "select_account" })`.

**Forgot password `/forgot-password`**. One email input, Server Action
`requestPasswordReset(email)`. Always returns success copy ("If that address
has a password, we've emailed a link") regardless of whether the user exists
or has a password. Generates 32 random bytes, stores `sha256` in
`PasswordResetToken` (30 min), emails `PasswordReset` with
`${APP_URL}/reset-password/${token}`.

**Reset password `/reset-password/[token]`**. Server component verifies the
token hash exists, unexpired, unused; otherwise shows "This link has expired.
Request a new one." Form: new password + confirm, Server Action
`resetPassword(token, password)`: bcrypt cost 12, sets `passwordHash`, clears
`mustChangePassword`, marks token used, deletes all other tokens for the
user. Then redirects to `/signin?reset=1` which shows "Password updated. Sign in."

**Change password `/account/password`**. Reached by force when
`mustChangePassword`. Current password not required in the forced case
(admin set it); required otherwise. `changePassword` action, then
`update()` the session so the flag clears without re-login.

**Password rules** (`src/lib/validation/auth.ts`): 10–72 characters, at least
one letter and one digit. Same schema for admin-set, reset and change.

## 5. Emails — `src/emails/`

| Template | To | Trigger | Content |
|---|---|---|---|
| `AccessRequested` | all SUPER_ADMIN | first unknown Google sign-in | "{name} ({email}) is asking for access" + button "Review in admin" → `${APP_URL}/admin` |
| `AccessApproved` | requester | Phase 09 approve action | "You're in" + "Sign in" button |
| `AccessDeclined` | requester | Phase 09 decline (optional checkbox) | short, no link |
| `PasswordReset` | user | forgot-password | link, "expires in 30 minutes", ignore-if-not-you line |
| `TemporaryPassword` | user | Phase 09 create user with password | the password in mono, "you'll be asked to change it" |

All use `src/emails/Layout.tsx`. Subject lines are plain: "Access request from
Daniel Tan", "Reset your Loving Hands Portal password", etc.

## 6. Sidebar user row

Replace the Phase 01 hard-coded user with `session.user`: Google image or
initials avatar (`Avatar` primitive) when `image` is null. "Sign out" calls
`signOut({ callbackUrl: "/signin" })`.

## 7. Tests

- Vitest: `rate-limit.test.ts` with a mocked Prisma; `validation/auth.test.ts`
  for the password schema; `auth.signIn.test.ts` covering active, disabled,
  unknown-with-domain, unknown-without-domain, declined.
- Playwright (`e2e/auth.spec.ts`): password sign-in with the seeded Aisha
  account lands on `/account/password`; after change, lands on `/`.

## 8. Acceptance criteria

1. Google sign-in with `SEED_SUPER_ADMIN_EMAIL` lands on `/`. A different
   Google account lands on `/signin/pending`, an `AccessRequest` row exists,
   and the super admin receives the email (check Resend logs).
2. Password sign-in with `aisha@lovinghands.my / Password123!` forces a password
   change, then works with the new password.
3. Six wrong passwords in a row show the rate-limit message; the sixth is
   refused even with the correct password.
4. Visiting `/purchase-orders` signed out redirects to `/signin?next=/purchase-orders`
   and returns there after sign-in.
5. `/admin` as a MEMBER renders the app's 404 page; as SUPER_ADMIN renders the
   Phase 01 stub.
6. Disabling a user in the database ends their session within 5 minutes.
7. Forgot-password link works once, expires after 30 minutes, and never
   reveals whether an email exists.
8. `auth-auditor` report has no High findings open.
9. A first-time visitor with no account can tell which control asks for
   access without guessing: the "New here?" label sits above the Google
   button and the sentence "Use Continue with Google to request access. An
   admin approves it." sits directly beneath it, left-aligned.
10. No label on the sign-in card is uppercased — "Members", "New here?",
    "Email" and "Password" render in sentence case in the mono family.
