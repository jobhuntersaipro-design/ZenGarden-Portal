<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project rules

Read these before writing any code:

- `CLAUDE.md` — project overview and commands
- `context/coding-standard.md` — TypeScript, React, Next.js, Tailwind rules
- `context/ai-interaction.md` — workflow, branching, commit rules
- `context/design-system.md` — **the ClickUp design system; all UI must follow it**

All colors, type, radii, spacing and shadows come from the `@theme` tokens in
`src/app/globals.css`. Never write a raw hex value, a px font size, or a
Tailwind arbitrary value in a component.

## Local / Cloud Agent environment

- Wire `.env.local` from Vercel Preview: `bash scripts/dev/wire-preview-env.sh`
  (needs `VERCEL_TOKEN`; never pass `--token` on the CLI). Details:
  `scripts/dev/README.md`.
- Local and Preview use the Neon **development** branch (`ep-mute-frog`) and
  R2 bucket `loving-hands-portal-dev`. Production is `ep-polished-wildflower`
  and bucket `loving-hands-portal`.
- Never run `db:migrate`, `db:deploy`, or `db:seed` against production. The
  Preview wire script refuses to write `.env.local` if the database host is
  production. Do not print or commit secret values.
