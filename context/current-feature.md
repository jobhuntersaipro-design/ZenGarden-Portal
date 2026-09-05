# Current Feature

Phase 08 — Products (`docs/specs/08-products.md`)

## Status

In progress. Branch `feature/products`. Phase 07 merged 2026-09-06.

## Goals

- `twelveMonthWindow(now)` exported once and passed to every caller, so the
  KPI tiles, the table, the footer summary and the order history can never
  read different windows
- `productStats`, `priceTrend` (gaps, not zeros), `whoBuysIt`,
  `boughtTogether`, `needsAttention` — pure and unit tested
- Catalog: KPI row over all products, quick-filter chips, clickable
  Needs-attention breakdown, grid and list views with the preference in
  `localStorage` behind the URL
- Product detail: gallery, facts, six stat tiles, price trend with the list
  reference line, who buys it, bought together, order history
- `ProductSheet` for super admins; members are read-only and the actions
  enforce it rather than the UI
- Product images through the Phase 03 presign/complete pattern, with a 1600px
  WebP derivative

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- **One dataset, one window.** The catalog KPI row describes all products and
  the footer summary describes the active filter; with no filter on they must
  read identically. The named bug to prevent is tiles reading "RM 0.00" beside
  a footer reading RM 15.5M, and an order-history table drifting to 367 days
  against tiles on 365.
- The sort control and the table headers share one piece of sort state — the
  reuse case `DataTable`'s `onSortChange` was refactored for in Phase 05.
- **Blocked on owner setup:** image upload, the WebP derivative and the gallery
  all need R2, which still holds placeholder credentials. Acceptance criteria 5
  and 10's super-admin half cannot be verified until it is set.
- New dependency: `@dnd-kit/core` and `@dnd-kit/sortable` for image reordering,
  named in `00-master.md` §3 for this phase.

## History

- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts) — **retired 2026-09-05**
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field — **retired 2026-09-05**
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
- 2026-09-05: Renamed ZenGarden to Loving Hands across the specs, context files and all twelve artboards; seed addresses moved to `@lovinghandsportal.com` and the canvas bundle and design spec became `loving-hands-*`. Business, data model and product catalogue unchanged. Fixed two latent clipping bugs surfaced by the new name: every wordmark variant used `line-height: 1`, which cropped the descender of "Loving" under `background-clip: text` (the sidebar mark also moved up to the on-system `heading-md` 26px), and the Main/Buyer chart x-axis labels were clipped to their own flex cell instead of overflowing into the empty neighbouring ones.
- 2026-09-05: Phase 01 §1 — Respond.io crawler, `/dashboard`, `src/lib/dashboard` and the four `crawl*` scripts deleted. `recharts` kept for Phase 06.
- 2026-09-06: Phase 07 complete and merged — the buyer analytics (`reorder`, `buyer-status`, `product-mix`, `product-trend`, `sparkline`) with 25 tests, the roster whose attention counts and table filter are one control, and buyer detail (five KPIs, order trend, product trend with a six-product picker, what-they-buy donut and bars, reorder signals linking to a preselected upload, a details card that renders no blank rows, intake bar, their POs). Buyer names became links everywhere. Three defects found and fixed: `listBuyers` pulled every line item's quantity, amount and product name when the roster needs product ids alone, costing 2.1s against 0.28s; the product picker assigned colour by position in the selected array, so deselecting the first product repainted the survivors — the URL now keeps freed slots (`?products=,b,c`) so an assignment survives a deselect; and a five-tile KPI row whose first tile spans two columns wrapped its last tile onto its own line.
- 2026-09-05: Phase 06 complete and merged — the pure analytics library (`buckets`, `range`, `sales`, `fulfillment`, `share`, `churn`, `price-drift`) with 70 tests, `loadDashboard` at 422 ms for Last year daily, and the page in its specified order: three KPI tiles, one trend card, the two status bars, the collapsed disclosure, the table last. KPI figures cross-checked against independent raw SQL — 400 orders, RM 8,161,352.29, 11 buyers. Three defects found and fixed: `buckets.startOf` never truncated the time for daily aggregation, so Last 30 days ending now drew 31 columns; the donut and line-chart palettes reached for `--color-primary`, which shadcn's `@theme inline` block rebinds to ink, so the validated hues were never the rendered ones (now unshadowed `--color-share-1..6`); and Recharts' default bar animation meant a screenshot caught an empty plot, the same failure the KPI count-up rule exists to prevent. **Known, not fixed:** `--ring` is set from `--color-primary` and is therefore ink rather than the purple the design system specifies — a Phase 01 issue affecting every focus ring in the app.
- 2026-09-05: Phase 05 complete and merged — the shared table machinery (`DataTable` taking `onSortChange`, `TablePagination`, `parsePagination`/`parseSort`, status and stage badges), the merged list over `PurchaseOrder` and `Extraction` as a parameter-bound `UNION ALL`, the filter row with live chip counts, and the detail page (breadcrumb, Lifecycle card, `StageStepper` with the breathing loop, document/data split, Activity, revisions, edit sheet). `advanceStage`/`revertStage` guard the update on the stage the caller last saw. Verified against the seeded data: advance, super-admin move back with a required note, and an edit appearing in Activity — all rolled back afterwards. **Criterion 4 is unverified** (R2 placeholder) and criterion 8 is covered by unit tests rather than two real tabs. The database caught three things the types could not: Postgres refuses an `ORDER BY` over a `UNION` that uses an expression rather than a result column name; "Confirmed by" ascending sorted the backlog to the bottom because ASC defaults to NULLS LAST, not NULLS FIRST as my comment claimed; and clearing the filters left the search text in the box. Two review findings from the first half were also fixed before shipping: `DataTable` hardwired its own URL writing, which would have stopped Phase 08's segmented control sharing sort state, and `StatusDot` took a `text-*` class where a background was needed. The edit sheet deliberately omits money and line items — editing totals after confirmation would bypass the Phase 04 totals gate and its audit entry.
- 2026-09-05: Phase 04 complete and merged — `PoExtractionSchema`, the extraction system prompt, `extractPurchaseOrder` over `messages.parse` with `zodOutputFormat`, the shared `runExtraction` runner wired into `/api/upload/complete` and `retryExtraction`, `/api/documents/[id]/url`, the review screen (react-pdf source column, draft form, buyer/product comboboxes, line-item editing with amount recompute, 800 ms debounced `saveDraft`), the totals gate, the duplicate check with revision numbering, and `confirmPurchaseOrder`. **Criterion 1 is unverified** (`ANTHROPIC_API_KEY` is a placeholder) and the source column cannot load (`R2_ACCOUNT_ID` likewise); everything else was verified against the seeded Neon database, including a full confirm that wrote a PO, six line items and a System stage event before being rolled back. A review pass found four defects, all fixed: the upload queue ignored the extraction result so a document Claude could not read still showed "Uploaded" and was counted in "Review N files"; the upload footer never linked to `/review`, leaving the whole multi-file review journey unreachable; the deferred "Extracting" row state was missing; and the review form defaulted `poDate` from UTC, pre-filling yesterday between midnight and 08:00 KL. Fixing them also surfaced two more: Retry re-uploaded a file that had arrived intact rather than asking for another read, and the queue's status vocabulary lived in the hook, coupling anything that reasoned about a row to the server actions and Auth.js.
- 2026-09-05: Phase 03 complete and merged — presign / complete / delete route handlers, `deleteOrphans()`, the `useUploadQueue` state machine (three concurrent XHR uploads, live progress, `beforeunload` guard), Dropzone with drop/browse/paste, one progress-bar geometry, plain-language failure reasons, the ready-only footer count, and "Upload PO" wired on Dashboard, Purchase orders and Buyers. **Criteria 1, 3, 4 and 8's enabled state are unverified**: R2 still holds placeholder credentials, so no browser PUT can reach the bucket. Re-run them once `docs/specs/SETUP-CHECKLIST.md` §2 is done. Fixed three defects found while building: `presignPut` pinned `ContentLength` to a ceiling rather than the file's exact size (S3 signs it exactly, so every real upload but one would have been refused); the `Document.r2Key` unique constraint needed a unique `pending:` placeholder because the key contains the row's own id; and the queue pump read a ref during render and drove state from an effect.
- 2026-09-05: Phase 02 complete and merged — Auth.js v5 with Google (approval-gated) and Credentials, database-backed rate limiting, forgot/reset/change password, five email templates, `src/proxy.ts` route protection, real `auth-guards.ts`, and the sidebar reading the real session. `auth-auditor`: 0 Critical, 0 High; both Mediums and three of five Lows fixed, the two accepted ones reasoned in `docs/audit-results/AUTH_SECURITY_REVIEW.md`. Added the `/admin` stub that acceptance criterion 5 measures against but Phase 01 never shipped, a password reveal toggle on every password field (not yet on the canvas), and two `@theme` tokens: `--spacing-control-oauth` and `--container-auth-card`.
- 2026-09-05: Phase 01 complete and merged — shadcn re-skinned to the tokens, Prisma 7 + Neon schema and first migration, deterministic seed, R2 / Resend / Claude / money / date / stage libraries with unit tests, App Shell with sidebar and placeholder pages.
