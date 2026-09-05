# Current Feature

Phase 05 — Purchase orders list and detail (`docs/specs/05-purchase-orders.md`)

## Status

In progress. Branch `feature/purchase-orders`. Phase 04 merged 2026-09-05.

## Goals

- Shared table machinery, reused by phases 06–09: `DataTable` (every column
  sortable, first-click direction per type), `TablePagination` (10/30/50),
  `parsePagination` / `parseSort`, `StatusBadge` and `StageBadge`
- List: one merged row model over confirmed POs *and* in-flight extractions,
  via a parameter-bound `UNION ALL` in raw SQL — sorting and paginating across
  two tables is not expressible in Prisma's query API
- Filters all AND-ed from the URL: `q` (PO number or any line-item
  description), buyer, uploader, status chip, stage, date range; every change
  resets to page 1
- The "Needs review" chip carries its count from the same query that feeds the
  table, never a separate figure; zero shows no number
- Detail: breadcrumb, header, Lifecycle card, `StageStepper` with the breathing
  loop (CSS keyframes gated by `prefers-reduced-motion`), document beside data,
  Activity list, revision links
- `advanceStage` / `revertStage` with a `where: { id, stage }` guard so two
  people clicking at once cannot double-advance; Move back is super-admin only,
  a real secondary button, with a required note
- `updatePurchaseOrder` through an edit sheet, appending an EDIT activity entry

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- `prevStage` does not exist yet in `src/lib/po-stages.ts`; Phase 01 shipped
  `nextStage`, `stageIndex`, `stagesUpTo` and `isFinalStage`.
- The raw SQL is the one deliberate exception to "Server Components fetch with
  Prisma directly". Parameters are bound, never interpolated.
- **Still blocked on owner setup, inherited from Phases 03 and 04:**
  `R2_ACCOUNT_ID` is a placeholder, so the detail page's document column cannot
  load a presigned GET; `ANTHROPIC_API_KEY` likewise, so no new extraction can
  be produced. The seeded backlog still exercises the list, the filters, the
  lifecycle and the activity log.

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
