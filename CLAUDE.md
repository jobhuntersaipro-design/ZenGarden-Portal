# Loving Hands Portal
Purchase-order intake portal for Loving Hands' ops team: upload a customer PO (PDF/image),
Claude extracts the fields, a person reviews and confirms, the record lands in Neon with the
original file in R2, and the dashboards read confirmed POs as sales and fulfillment trends.

## Context Files
Read the following to get the full context of the project:
- @context/project-overview.md
- @context/coding-standard.md
- @context/ai-interaction.md
- @context/current-feature.md

## Web Design (source of truth for every screen)

The approved visual design lives in Claude Design:
https://claude.ai/code/artifact/43c584c8-b4b6-4479-8d0f-391ab44299ae?org=a2177e54-d854-4d2e-a8f5-d482dfd63d88

Every screen, state and interaction is drawn there. Build what the canvas shows; if the
canvas and a spec file disagree, the canvas wins for visuals and the spec wins for data
and behaviour. The written companion is `docs/specs/design/loving-hands-portal-design.md`; coders start at `docs/specs/00-master.md`.

## Design System

**All UI must follow the ClickUp design system.** The tokens live in
`src/app/globals.css` under `@theme` — use them (`bg-ink`, `text-body-md`,
`rounded-pill`, `p-md`, …). Never write a raw hex, a px font size, or a
Tailwind arbitrary value in a component.

Read `context/design-system.md` before building or restyling any UI — it has
the full spec: color roles, the two-family type ramp, the eight-tier radius
scale, all 22 component definitions, and the Do's and Don'ts.

Product-level conventions that override or extend it — the status colour
palette, sentence-case labels, truncation recovery, and the rule that a KPI
never renders zero on first paint — live in `docs/specs/00-master.md` §4
"Design conventions". Read those too before building UI.

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — run ESLint (flat config, `eslint.config.mjs`)


