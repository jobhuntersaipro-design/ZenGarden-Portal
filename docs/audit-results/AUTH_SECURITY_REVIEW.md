# Auth Security Review

**Last Audit Date:** 2026-09-05
**Auditor:** auth-auditor agent
**Scope:** Phase 02 authentication and access control on branch `feature/auth`
(docs/specs/02-auth.md) — `src/lib/auth.ts`, `src/lib/auth.config.ts`,
`src/lib/auth-access.ts`, `src/lib/auth-guards.ts`, `src/lib/rate-limit.ts`,
`src/lib/validation/auth.ts`, `src/actions/auth.ts`, `src/proxy.ts`,
`src/app/(auth)/**`, `src/app/(portal)/layout.tsx`, `src/app/(portal)/admin/page.tsx`,
`src/app/not-found.tsx`, `src/components/auth/**`, `src/components/portal/UserMenu.tsx`,
`src/emails/**`, `src/types/next-auth.d.ts`, `prisma/schema.prisma`.

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🟢 Low | 5 |

## 🔴 Critical

No issues found.

## 🟠 High

No issues found. The core flows I was asked to stress — the `signIn` callback's
handling of unknown/declined/disabled Google accounts, the `jwt` callback's
session-version and disabled-user cutoff, the `/admin` role gate, the
`?next=` redirect guard, and the change-password re-mint — all resolved
correctly in code review (see ✅ Passed Checks). Nothing here rises to High.

## 🟡 Medium

### 1. Password-reset request leaks account existence via response timing
- **File**: `src/actions/auth.ts`
- **Line(s)**: 39–80 (`requestPasswordReset`)
- **Issue**: The response body is identical whether or not the address has an
  account (correct, and covered by a code comment). But the code path for an
  existing, password-having, enabled user does a token `create` **and**
  `await sendEmail(...)` (a network call to the Resend API) before returning;
  the path for a non-existent/passwordless/disabled address returns
  immediately after one indexed `findUnique`. The two paths therefore take
  measurably different amounts of wall-clock time — Resend's API round trip
  is typically 100s of ms, versus a few ms for a single Postgres lookup.
- **Impact**: An attacker who can measure response latency (a simple script
  timing repeated requests) can distinguish "real, active, password-enabled
  account" from everything else, defeating the enumeration protection the
  identical response body was designed to provide. This is the classic
  timing side-channel that generic-response-copy patterns are supposed to
  close.
- **Fix**: Make both branches take approximately the same time. Options,
  cheapest first: (a) don't `await` the `sendEmail` call — fire it and let it
  resolve in the background (Next.js keeps the function alive on Vercel via
  `waitUntil`/`after()`); or (b) always perform an equivalent-cost dummy
  operation (e.g. a `bcrypt.compare` against a fixed dummy hash, or an
  `await` of a fixed small delay) on the "nothing to do" branch so both paths
  have comparable latency; or (c) always enqueue the token creation
  synchronously but send the email via `after()` from `next/server` so the
  Server Action itself returns before the network call, regardless of branch.

### 2. `/admin` proxy rewrite may return HTTP 200 instead of 404 (soft 404)
- **File**: `src/proxy.ts`
- **Line(s)**: 56–61
- **Issue**: `NextResponse.rewrite(new URL("/not-found", request.nextUrl))` is
  called with no explicit status. Next.js App Router has a long-standing,
  still-current limitation where rewriting to an unmatched path from
  middleware/proxy renders the not-found UI but can ship it with a `200`
  status rather than `404`, because the response has already started
  streaming by the time the not-found boundary resolves. Next's own
  documented workaround is to pass the status explicitly:
  `NextResponse.rewrite(url, { status: 404 })`.
- **Impact**: The page a MEMBER sees is visually indistinguishable from a
  real 404 (good), but if the HTTP status code is actually `200`, an
  automated scanner diffing status codes (not body content) between `/admin`
  and a genuinely nonexistent path such as `/asdf` could still tell them
  apart, undermining the spec's explicit goal ("404, never 403: a member
  must not learn that `/admin` is a real route").
- **Fix**: `return NextResponse.rewrite(new URL("/not-found", request.nextUrl), { status: 404 })`.
  Verify with `curl -I` against a deployed preview that `/admin` as a MEMBER
  returns `404` and not `200`, since this is a known framework-level gap
  rather than something unit tests will catch.

## 🟢 Low

### 1. Seeded member password is hashed at bcrypt cost 10, not the project's cost 12
- **File**: `prisma/seed.ts`
- **Line(s)**: 90
- **Issue**: `hashSync("Password123!", 10)` uses cost factor 10, while every
  production code path (`src/actions/auth.ts` `BCRYPT_COST = 12`) uses 12.
- **Impact**: Negligible in isolation — this is dev/demo seed data for an
  account that is forced to change its password on first login
  (`mustChangePassword: true`) — but it is an inconsistency that could get
  copy-pasted into a real code path later, and cost-10 hashes are noticeably
  cheaper to brute force than cost-12 if a database dump ever leaked.
- **Fix**: Use `BCRYPT_COST` (or the literal `12`) in the seed script too, so
  there is one number to keep in sync with `docs/specs/02-auth.md`.

### 2. Auto-approve domain can silently re-admit a previously declined requester
- **File**: `src/lib/auth-access.ts`
- **Line(s)**: 28–57 (`resolveGoogleSignIn`)
- **Issue**: The lookup order is: existing `User`? → `AUTO_APPROVE_DOMAIN`
  match? → `AccessRequest` queue. If an admin declines a request and later
  turns on (or widens) `AUTO_APPROVE_DOMAIN` to cover that person's email
  domain, the next Google sign-in creates the user immediately as `MEMBER`
  without ever consulting the `DECLINED` `AccessRequest` row.
- **Impact**: Low — this requires an admin to actively configure
  `AUTO_APPROVE_DOMAIN` to include a domain containing a previously-declined
  address; it is not attacker-triggerable on its own. But it is a silent
  override of an explicit access decision, which is easy to miss during an
  incident review.
- **Fix**: Before creating the user in the auto-approve branch, check for an
  existing `AccessRequest` with `status: DECLINED` for that email and skip
  auto-approval (send to `/signin/pending?declined=1` instead), or log/alert
  when this override happens.

### 3. Password-reset token single-use check is not atomic with its consumption
- **File**: `src/actions/auth.ts`
- **Line(s)**: 104–136 (`resetPassword`)
- **Issue**: The token's `usedAt`/`expiresAt` validity is read in a plain
  `findUnique` and then consumed in a separate `$transaction`. There is a
  window between the read and the transactional write where two concurrent
  submissions of the same token (e.g., a double form-submit or a replayed
  request) could both pass the initial check before either marks the token
  used.
- **Impact**: Low — exploitable only by whoever already holds the one-time
  token (i.e., whoever received the reset email or intercepted the link), so
  it does not grant an attacker anything they did not already have. At worst
  it lets the legitimate recipient set the password twice in a race.
- **Fix**: Fold the validity check into the transaction as a conditional
  update, e.g. `prisma.passwordResetToken.updateMany({ where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } })`
  and check the returned `count === 1` before proceeding, so the check and
  the consumption are the same atomic operation.

### 4. `clientIp()` trusts `x-forwarded-for` without provider-specific verification
- **File**: `src/lib/rate-limit.ts`
- **Line(s)**: 110–117
- **Issue**: `clientIp()` takes the first comma-separated value of
  `x-forwarded-for`, falling back to `x-real-ip`. On Vercel (this project's
  documented host) this is safe: Vercel's docs state it "overwrite[s] the
  `X-Forwarded-For` header and do[es] not forward external IPs" specifically
  "to prevent IP spoofing," so a client cannot inject values ahead of the
  real one in production. However, the function itself has no such
  guarantee built in — it will happily trust a client-supplied header if the
  app is ever run behind a different reverse proxy, a self-hosted target, or
  in local dev without a proxy in front of it.
- **Impact**: None in the current production topology (verified against
  Vercel's own documentation, see Sources). It becomes a rate-limit-bypass
  vector only if the deployment target changes and the new fronting proxy
  does not sanitize the header the same way.
- **Fix**: No change required for the current Vercel deployment. If the
  hosting target ever changes, add an explicit trusted-proxy allowlist or
  switch to a header that the new platform guarantees is untamperable (e.g.
  Vercel's own `x-vercel-forwarded-for` no longer applies verbatim to a
  different host) and note the assumption in a comment next to `clientIp()`.

### 5. Credentials `authorize()` has a documented timing side-channel for unknown emails
- **File**: `src/lib/auth.ts`
- **Line(s)**: 83–92
- **Issue**: `authorize()` skips the `bcrypt.compare` call entirely when the
  email does not resolve to a usable (enabled, password-having) user, so an
  unknown or disabled email returns much faster than one that reaches the
  compare step. This is called out explicitly in an in-code comment as an
  accepted trade-off ("the portal has no self-service sign-up, so the set of
  addresses is not a secret worth defending").
- **Impact**: Low, and already a conscious decision by the team: this is an
  internal-ops tool with admin-provisioned accounts, not a consumer product
  where the existence of an email address is itself sensitive. Recording it
  here so it stays a deliberate, revisited decision rather than a forgotten
  one — if the user base ever grows to include externally-guessable
  addresses, this should be revisited (e.g. always run a dummy
  `bcrypt.compare` against a fixed hash on the "nothing to compare" path).
- **Fix**: No action required unless the trust model changes; consider
  adding a one-line pointer to this review from the code comment so the
  trade-off is easy to find again later.

## ✅ Passed Checks

### Password hashing and the bcrypt 72-byte ceiling
- **What**: Whether passwords are hashed with an adequate cost factor and
  whether the bcrypt 72-*byte* truncation limit is enforced correctly
  (not just 72 characters).
- **Status**: ✅ Correct
- **Details**: `src/actions/auth.ts` hashes with `bcrypt` cost 12
  (`BCRYPT_COST = 12`) for both `resetPassword` and `changePassword`.
  `src/lib/validation/auth.ts`'s `passwordSchema` caps length at 72
  characters *and* separately re-checks
  `new TextEncoder().encode(value).length <= 72`, which correctly rejects a
  password that is ≤72 JS characters but >72 UTF-8 bytes (e.g. accented
  characters) — exactly the case that would otherwise be silently truncated
  by bcrypt into a different effective password than the one the user typed.
  Covered by `src/lib/validation/auth.test.ts`.

### Password reset token generation, storage, single-use, and expiry
- **What**: Whether reset tokens are unguessable, stored safely, expire, and
  cannot be replayed.
- **Status**: ✅ Correct
- **Details**: `requestPasswordReset` generates 32 bytes via
  `crypto.randomBytes(32)` (256 bits of entropy) and only ever stores
  `sha256(token)` in `PasswordResetToken.tokenHash` — the raw token exists
  only in the emailed URL and in memory during the request, never at rest.
  `expiresAt` is `now + 30 min` and enforced on both the display check
  (`isResetTokenValid`) and the actual `resetPassword` action. On successful
  reset, the token's `usedAt` is set (not deleted, preserving an audit
  trail) and — correctly — every *other* `PasswordResetToken` row for that
  user is deleted (`deleteMany({ userId, id: { not: row.id } })`), so an
  older, still-valid link cannot be used after a newer one succeeds.
  Resetting also bumps `sessionVersion`, signing out every existing session
  on the account.

### Password reset and forgot-password user-enumeration resistance (response content)
- **What**: Whether the forgot-password form or the reset-token check leaks
  whether an email address has an account.
- **Status**: ✅ Correct (response body only — see Medium #1 for a timing
  caveat)
- **Details**: `requestPasswordReset` always returns
  `{ success: true, data: undefined }` regardless of whether the user
  exists, has a password, is disabled, or has hit their reset quota,
  including on a thrown/caught error. `ForgotPasswordForm` shows the same
  copy every time. The `/reset-password/[token]` page shows only "This link
  has expired" for a missing, expired, or used token — it never distinguishes
  those cases.

### Rate limiting design and bypass resistance
- **What**: Whether login and password-reset rate limiting is enforced
  server-side, checks the right dimensions, and can't trivially be reset.
- **Status**: ✅ Correct
- **Details**: `checkLoginAllowed` is Postgres-backed (correct for a
  serverless deployment with no shared memory) and checks both the email and
  IP dimensions independently within a 15-minute window, throwing before the
  password is even compared once either hits 5 failures — this matches the
  acceptance criterion that the *sixth* wrong attempt is refused even with
  the eventually-correct password. `checkPasswordResetAllowed` caps issued
  tokens at 3/hour per user. The opportunistic 1-in-50 cleanup only deletes
  rows older than 24 hours, well outside every window it gates, so it cannot
  be used to reset an attacker's own counters early. Both rate-limit
  functions are exercised by `src/lib/rate-limit.test.ts`.

### `signIn` callback: unknown, declined, and disabled Google accounts
- **What**: Whether an unknown or declined Google account can obtain a
  session, and whether a disabled user is turned away.
- **Status**: ✅ Correct
- **Details**: `resolveGoogleSignIn` only ever returns `true` for an active,
  known user or a freshly auto-approved-domain user; every other case
  (disabled, unknown without a matching domain, previously declined) returns
  a redirect *path string*, and Auth.js does not create a session or a
  database user for that case. No code path returns `true` for an unknown or
  declined address. Verified against `src/lib/auth.signIn.test.ts`, which
  covers active, disabled, auto-approve, lookalike-domain, first-queue,
  repeat-queue (no duplicate email), and declined cases.

### `AUTO_APPROVE_DOMAIN` matching cannot be tricked by a lookalike or subdomain
- **What**: Whether `email.endsWith(`@${domain}`)` can be fooled by a
  similar-looking domain (e.g. `notlovinghandsportal.com`) or a subdomain.
- **Status**: ✅ Correct
- **Details**: Because the match string is `@${domain}` (with the leading
  `@`) and a valid email has exactly one `@`, the character immediately
  before the matched suffix must be `@` for `endsWith` to succeed. This
  rules out both `attacker@notlovinghandsportal.com` (the `@` sits before
  `notlovinghandsportal.com`, not before `lovinghandsportal.com`) and any
  attacker-registered sibling domain that merely ends with the same string.
  A genuine subdomain of the approved domain (e.g.
  `user@mail.lovinghandsportal.com`) would *not* match either, since the
  character before the suffix would be `.` — which is a stricter behaviour
  than the spec requires, not a looser one. Explicitly covered by the
  "does not auto-approve a lookalike domain" test.

### `allowDangerousEmailAccountLinking: true`
- **What**: Whether enabling dangerous account linking for Google is safe
  given this app's shape.
- **Status**: ✅ Correct, as configured
- **Details**: Google is the only OAuth provider, and Google itself verifies
  the email address before issuing the profile, so the classic risk (an
  attacker registers Google with a victim's un-verified email and inherits
  their existing password-based account) does not apply. The risk is
  correctly documented in a code comment at the point of configuration.

### `jwt` callback: disabled, demoted, and signed-out-everywhere users
- **What**: Whether a disabled user, a demoted user, or a user whose
  `sessionVersion` was bumped keeps a working session, and whether the
  5-minute refresh window is honoured.
- **Status**: ✅ Correct
- **Details**: On every call where `trigger === "update"` or where
  `Date.now() - token.refreshedAt > 5 min`, the callback re-reads `role`,
  `disabledAt`, `mustChangePassword`, and `sessionVersion` from the
  database. A `null` return (ending the session) happens if the user is gone
  or disabled, or — for anything other than the sign-in pass itself — if the
  stored `sessionVersion` is now higher than the token's, which is exactly
  how a password change or admin reset signs a user out everywhere within
  the refresh window. The fresh sign-in path correctly exempts itself from
  the stale-version check (it *adopts* whatever version the row has, rather
  than comparing against a token that does not exist yet).

### Defense in depth: proxy vs. server-side guards
- **What**: Whether the Prisma-free `src/proxy.ts` is the only check, or
  whether every page/action re-verifies.
- **Status**: ✅ Correct
- **Details**: `src/proxy.ts` is built from `authConfig` alone (no adapter,
  no custom `jwt` callback) and is explicitly documented as defense in depth
  only. The authoritative check is `getSessionUser()`
  (`src/lib/auth-guards.ts`), which calls the full `auth()` from
  `src/lib/auth.ts` and therefore runs the database-backed `jwt` callback on
  every call. `src/app/(portal)/layout.tsx` calls it on every portal page
  render, and `src/app/(portal)/admin/page.tsx` independently re-checks
  `role === SUPER_ADMIN` and calls `notFound()` itself rather than trusting
  the proxy's rewrite. `src/actions/auth.ts`'s `changePassword` calls
  `requireUser()` before touching the database.

### `?next=` open-redirect guard
- **What**: Whether the post-sign-in redirect target can be used to leave
  the site.
- **Status**: ✅ Correct
- **Details**: `safeNext()` in `src/app/(auth)/signin/page.tsx` requires the
  value to start with `/` and explicitly rejects `//...` and `/\...`
  (protocol-relative and backslash variants), which are the two classical
  bypasses for a same-origin-path check. The validated value is threaded
  through as a prop rather than re-read from the URL on the client, so the
  client-side `router.push(next)` and the Google `redirectTo: next` cannot
  be handed a different, unvalidated value.

### `/admin` returns 404, not 403, at the page level
- **What**: Whether a MEMBER visiting `/admin` learns the route exists.
- **Status**: ✅ Correct at the page level (see Medium #2 for the proxy-level
  HTTP status caveat)
- **Details**: `src/app/(portal)/admin/page.tsx` calls Next's `notFound()`
  directly when the session role is not `SUPER_ADMIN`, which is the
  officially-supported mechanism for a real 404 response, independent of
  the proxy's own rewrite.

### Change-password flow: no privilege escalation or session fixation
- **What**: Whether bumping `sessionVersion` and re-minting the current
  session via a server-side `signIn` call introduces a window where the old
  session, a stale role, or forged credentials could be used.
- **Status**: ✅ Correct
- **Details**: `changePassword` requires the current password (unless
  `mustChangePassword` is set, which only an admin action can cause), hashes
  the new password before touching the database, and bumps `sessionVersion`
  in the same `prisma.user.update` call, so there is no window where the
  password is changed but old sessions remain valid. The re-mint calls
  `signIn("credentials", { email, password: <new password>, redirect: false })`,
  which re-runs the full `authorize()` → `jwt()` pipeline against the
  now-current row, so the freshly re-minted token carries the *matching*
  post-increment `sessionVersion`, `role`, and `mustChangePassword` rather
  than stale values. If the re-mint fails for any reason, the action still
  reports success but flags `reauthenticated: false`, and the client signs
  the browser out to `/signin?reset=1` rather than leaving a stale cookie
  in place.

### Input validation
- **What**: Whether every auth Server Action validates its input with Zod
  before touching the database.
- **Status**: ✅ Correct
- **Details**: `signInSchema`, `requestPasswordResetSchema`,
  `resetPasswordSchema`, and `changePasswordSchema` in
  `src/lib/validation/auth.ts` are used at the top of `authorize()`,
  `requestPasswordReset`, `resetPassword`, and `changePassword`
  respectively, each returning early on a failed `safeParse` before any
  Prisma call. All lookups (`prisma.user.findUnique`, etc.) use Prisma's
  parameterized query builder, so there is no raw SQL/string interpolation
  surface in this phase's code.

### Token, secret, and password redaction in logs and emails
- **What**: Whether reset tokens, passwords, or other secrets leak into
  server logs or error messages.
- **Status**: ✅ Correct
- **Details**: `src/lib/email.ts`'s `sendEmail` only logs the subject and
  recipient on failure, never the React email body (which is where the
  reset link or temporary password lives). Server Action `catch` blocks log
  only a fixed string and the `cause`, not user input. The reset token
  itself is never logged anywhere in `src/actions/auth.ts`.

Sources consulted during this audit:
- [Vercel — Request headers: x-forwarded-for](https://vercel.com/docs/headers/request-headers) — confirms Vercel overwrites `x-forwarded-for` and does not forward externally-supplied values, "to prevent IP spoofing."
- [Vercel Community Discussion #2484 — x-forwarded-for gets overwritten when deployed in Vercel](https://github.com/vercel/community/discussions/2484)
- [GitHub vercel/next.js#50155 — Incorrect response status code when using NextResponse.rewrite(url, { status }) in middleware](https://github.com/vercel/next.js/issues/50155)
- [Next.js — functions: notFound](https://nextjs.org/docs/app/api-reference/functions/not-found)

---

## Remediation, 2026-09-05

Applied on `feature/auth` before the PR:

| Finding | Status |
|---|---|
| 🟡 Medium 1 — reset-request timing side-channel | **Fixed.** The Resend call moved into `after()` in `src/actions/auth.ts`, so both branches return on the same DB-only path. |
| 🟡 Medium 2 — `/admin` soft 404 | **Fixed.** `src/proxy.ts` now pins `{ status: 404 }` on the rewrite. |
| 🟢 Low 1 — seed hashed at cost 10 | **Fixed.** `prisma/seed.ts` uses cost 12, matching every other write. |
| 🟢 Low 2 — auto-approve readmits a declined requester | **Fixed.** `src/lib/auth-access.ts` checks for a DECLINED request before the domain shortcut; regression test in `src/lib/auth.signIn.test.ts`. |
| 🟢 Low 3 — non-atomic single-use token check | **Fixed.** `resetPassword` claims the token with a conditional `updateMany` inside the transaction; the loser of a race changes nothing. |
| 🟢 Low 4 — `x-forwarded-for` trust | **Accepted.** Vercel overwrites the header at the edge; the comment in `src/lib/rate-limit.ts` records the dependency. Revisit if the app is ever hosted elsewhere. |
| 🟢 Low 5 — `authorize()` timing on unknown emails | **Accepted and documented in the code.** The portal has no self-service sign-up, so the address list is not a secret worth a dummy-hash comparison. |
