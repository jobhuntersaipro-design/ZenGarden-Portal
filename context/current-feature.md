# Current Feature

Phase 03 — Upload to R2 (`docs/specs/03-upload.md`)

## Status

In progress. Branch `feature/upload`. Phase 02 merged 2026-09-05.

## Goals

- `POST /api/upload/presign` — validate type, size and count, create the
  `Document` rows, return presigned PUTs with `ContentType` and `ContentLength`
  pinned; rejected files come back in `errors[]` and the rest proceed
- `POST /api/upload/complete` — owner check, `HEAD` the object, verify size and
  type, create `Extraction { PENDING }`. Keeps `maxDuration = 120` for Phase 04
- `DELETE /api/upload/[documentId]` — owner-only, removes the object and the row
  while no `Extraction` exists
- `deleteOrphans()` in `src/lib/queries/documents.ts`, called on 1 presign in 20
- `/upload`: dropzone (drop, browse, paste), `useUploadQueue` state machine,
  three concurrent XHR uploads with live progress, `beforeunload` guard
- One progress-bar geometry across every state; only fill colour and label differ
- Every failed row carries a plain-language reason beside Retry
- Sticky footer counting ready rows only, disabled at zero, with a caption
  naming what was excluded
- `?buyer=<id>` carried through to `Extraction.draftJson.buyerId`

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- Extraction is Phase 04. The queue stops at "Uploaded" here and the complete
  route only records the document.
- `/upload` stays out of the sidebar (G1). The way in is the "Upload PO"
  primary in the page header of Dashboard, Purchase orders, Buyers and Buyer
  detail; "Purchase orders" stays lit while `/upload` is open.
- **Infra prerequisite, owner action:** the R2 bucket needs the CORS policy from
  `docs/specs/SETUP-CHECKLIST.md` §2.3 allowing `PUT` from the app's origins.
  Browser uploads fail without it and no code change can substitute.

## History

- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
