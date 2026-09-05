# Current Feature

Phase 02 — Authentication and access (`docs/specs/02-auth.md`)

## Status

Complete. Merged to `main` 2026-09-05.

## Goals

- Auth.js v5 with Google (approval-gated) and Credentials (admin-set passwords)
- `signIn` callback: active in, disabled out, unknown queues an `AccessRequest`
  and emails every super admin, `AUTO_APPROVE_DOMAIN` shortcut
- `jwt` callback re-reads role, `disabledAt`, `mustChangePassword` and
  `sessionVersion` every 5 minutes so a disabled or demoted user is cut off
- Route protection in `src/proxy.ts`; `/admin` 404s for members, never 403s
- Database-backed rate limiting (5 failed logins / 15 min per email and per IP)
- Forgot / reset / change password with 30-minute single-use tokens
- Five transactional email templates
- Sidebar user row reads the real session

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- Two deliberate deviations from the phase file's letter, both commented in code:
  1. The disabled-Google branch returns the redirect string `/signin?error=disabled`
     rather than `false`. Returning `false` raises `AccessDenied` and lands the user
     on `?error=AccessDenied`, which is not the outcome the spec asks for.
  2. `src/proxy.ts` uses a Prisma-free `src/lib/auth.config.ts` instance, as the
     phase file requires. The authoritative disabled / `sessionVersion` check lives
     in the full `jwt` callback, which every page, action and route handler goes
     through.

- Added beyond the phase file's letter, each for a reason:
  - `src/app/(portal)/admin/page.tsx`. Acceptance criterion 5 checks `/admin`
    against "the Phase 01 stub", but Phase 01 never shipped one. This is the
    smallest page that makes the criterion testable; Phase 09 replaces it.
  - The Google branch refuses a profile whose `email_verified` is false.
    `allowDangerousEmailAccountLinking` rests entirely on Google having verified
    the address, so the one case where it has not must not link.
  - A completed reset signs this browser out as well, rather than pushing to
    `/signin?reset=1`. The reset bumps `sessionVersion`, so the session is
    already dead; without the sign-out the proxy bounced the redirect straight
    back into the portal on a cookie it had not re-checked yet.
  - Two `@theme` tokens: `--spacing-control-oauth: 48px` (the Google button's
    height on the canvas, between `control-md` and `control-lg`) and
    `--container-auth-card: 480px` (the auth card width).

## History

- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
