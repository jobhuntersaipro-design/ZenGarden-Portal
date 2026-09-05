# Current Feature

Phase 04 — Claude extraction and review (`docs/specs/04-extraction-review.md`)

## Status

Complete. Merged to `main` 2026-09-05. Criterion 1 (live extraction) and the
source column remain unverified until the two placeholder keys are set.

## Goals

- `PoExtractionSchema` + system prompt + `extractPurchaseOrder(bytes, mimeType)`
  over `client.messages.parse` with `zodOutputFormat`, 90 s timeout
- `/api/upload/complete` runs extraction inline: RUNNING → SUCCEEDED with
  `rawJson`, `draftJson`, confidence, model, tokens, `Document.pageCount`; or
  FAILED with the error
- `/review/[id]`: source on the left (`react-pdf` or `<img>`), draft form on the
  right, buyer on its own full-width row, per-field confidence
- Line-item editing with amount recompute, product and buyer comboboxes,
  800 ms debounced `saveDraft`
- **Totals gate**: computed `subtotal + tax` vs the document's printed total,
  compared as Decimal strings at 2 dp. Persistent banner above the split,
  Confirm locked, exactly two ways out — fix the numbers, or acknowledge (which
  writes an auditable `PoStageEvent { kind: EDIT }`). Re-checked server-side.
- Duplicate check on buyer + PO number, revision numbering on override
- `confirmPurchaseOrder` writes the PO, line items and stage event in one
  transaction; discard and retry actions

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- Low confidence is a warning only. It never blocks Confirm and plays no part
  in the totals gate.
- `PoExtractionSchema` takes the model's JSON **numbers**; the draft keeps
  money as **strings** from the first render so nothing is rounded twice.
- **Blocked on owner setup, and this phase inherits both:**
  - `ANTHROPIC_API_KEY` is `PLACEHOLDER_setup_step_5`, so no live extraction
    can run. Acceptance criterion 1 is unverifiable until it is set.
  - `R2_ACCOUNT_ID` is still a placeholder (see Phase 03), so `DocumentPreview`
    cannot fetch a presigned GET and the source column stays empty.
  - Everything else — the totals gate, the duplicate check, revision numbering,
    the confirm transaction — is provable against the seeded Neon database with
    a mocked Anthropic client, and is being tested that way.

## History

- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-05: Phase 04 complete and merged — `PoExtractionSchema`, the extraction system prompt, `extractPurchaseOrder` over `messages.parse` with `zodOutputFormat`, the shared `runExtraction` runner wired into `/api/upload/complete` and `retryExtraction`, `/api/documents/[id]/url`, the review screen (react-pdf source column, draft form, buyer/product comboboxes, line-item editing with amount recompute, 800 ms debounced `saveDraft`), the totals gate, the duplicate check with revision numbering, and `confirmPurchaseOrder`. **Criterion 1 is unverified** (`ANTHROPIC_API_KEY` is a placeholder) and the source column cannot load (`R2_ACCOUNT_ID` likewise); everything else was verified against the seeded Neon database, including a full confirm that wrote a PO, six line items and a System stage event before being rolled back. A review pass found four defects, all fixed: the upload queue ignored the extraction result so a document Claude could not read still showed "Uploaded" and was counted in "Review N files"; the upload footer never linked to `/review`, leaving the whole multi-file review journey unreachable; the deferred "Extracting" row state was missing; and the review form defaulted `poDate` from UTC, pre-filling yesterday between midnight and 08:00 KL. Fixing them also surfaced two more: Retry re-uploaded a file that had arrived intact rather than asking for another read, and the queue's status vocabulary lived in the hook, coupling anything that reasoned about a row to the server actions and Auth.js.
- 2026-09-05: Phase 03 complete and merged — presign / complete / delete route handlers, `deleteOrphans()`, the `useUploadQueue` state machine (three concurrent XHR uploads, live progress, `beforeunload` guard), Dropzone with drop/browse/paste, one progress-bar geometry, plain-language failure reasons, the ready-only footer count, and "Upload PO" wired on Dashboard, Purchase orders and Buyers. **Criteria 1, 3, 4 and 8's enabled state are unverified**: R2 still holds placeholder credentials, so no browser PUT can reach the bucket. Re-run them once `docs/specs/SETUP-CHECKLIST.md` §2 is done. Fixed three defects found while building: `presignPut` pinned `ContentLength` to a ceiling rather than the file's exact size (S3 signs it exactly, so every real upload but one would have been refused); the `Document.r2Key` unique constraint needed a unique `pending:` placeholder because the key contains the row's own id; and the queue pump read a ref during render and drove state from an effect.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
