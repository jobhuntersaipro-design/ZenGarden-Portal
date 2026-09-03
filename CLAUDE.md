# Your Project Name
Project descriptions

## Context Files
Read the following to get the full context of the project:
- @context/project-overview.md
- @context/coding-standard.md
- @context/ai-interaction.md
- @context/current-feature.md

## Design System

**All UI must follow the ClickUp design system.** The tokens live in
`src/app/globals.css` under `@theme` — use them (`bg-ink`, `text-body-md`,
`rounded-pill`, `p-md`, …). Never write a raw hex, a px font size, or a
Tailwind arbitrary value in a component.

Read `context/design-system.md` before building or restyling any UI — it has
the full spec: color roles, the two-family type ramp, the eight-tier radius
scale, all 22 component definitions, and the Do's and Don'ts.

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — run ESLint (flat config, `eslint.config.mjs`)


