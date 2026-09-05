# Current Feature

Phase 01 — Foundation (`docs/specs/01-foundation.md`)

## Status

Not started. Specs approved 2026-09-04; owner completing `docs/specs/SETUP-CHECKLIST.md`.

## Goals

- Retire the Respond.io dashboard and crawler
- Install and re-skin shadcn to the design tokens
- Prisma 7 + Neon schema, first migration, deterministic seed
- R2, Resend, Claude, money/date/stage libraries with unit tests
- App Shell with sidebar and placeholder pages

## Notes

- Read `docs/specs/00-master.md` before this phase file.
- Branch: `feature/foundation`.

## History

- 2026-04-12: Respond.io API crawler built and first full crawl completed (1,582 contacts)
- 2026-04-12: Started Playwright automation for "Conversation Opened By" field
- 2026-09-04: Respond.io crawler and `/dashboard` marked for retirement (Phase 01). Portal spec set written in `docs/specs/`.
- 2026-09-05: Design review applied to the canvas and to every spec. Upload left the sidebar; the dashboard leads with a work queue and folds its analytics away; a totals mismatch locks Confirm on the review screen; one status palette; sentence-case labels; truncation recovery; KPIs render their real value on first paint. Canvas sources now live in `docs/design/`.
