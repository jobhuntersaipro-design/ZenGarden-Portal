# Zen Garden Portal
Purchase-order intake portal for Zen Garden's ops team: upload a customer PO (PDF/image),
Claude extracts the fields, a person reviews and confirms, the record lands in Neon with the
original file in R2, and the dashboards read confirmed POs as sales and fulfillment trends.

## Context Files
Read the following to get the full context of the project:
- @context/project-overview.md
- @context/coding-standard.md
- @context/ai-interaction.md
- @context/current-feature.md

`context/current-feature.md` is long and is the project's own history: the phase
being built now, then every phase before it with **what was verified, with the
figures** and **what was not**. Read the top before starting work; search it
before re-deriving anything, because most gotchas are already recorded there.

## Commands
- `npm run dev` — dev server (port 3000; the storefront needs a second hostname, below)
- `npm run build` — `prisma generate && next build`
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npm test` — Vitest, run once (`npx vitest run src/path/to/file.test.ts` for one file)
- `npx tsc --noEmit` — typecheck; not an npm script, but part of every phase's done bar
- `npm run test:e2e` — Playwright
- `npm run db:migrate` / `db:deploy` / `db:seed` / `db:studio`

Before committing: tests, `tsc --noEmit`, lint and `npm run build` all clean.
Ask before committing (`context/ai-interaction.md`).

## Architecture

Next.js 16 App Router (`proxy.ts`, not `middleware.ts`), React 19, TypeScript strict,
Tailwind v4, Prisma 7 on Neon, R2 for files, Resend for email, Auth.js v5, Claude for
extraction. Deployed on Vercel, region `sin1` (Neon is in ap-southeast-1).

### Two hosts, one deployment

`src/proxy.ts` reads the `Host` header. On the shop host it rewrites `/x` → `/shop/x`;
on the portal host `/shop/*` is a pinned 404. `SHOP_HOST` unset means one host and
everything is the portal — which is what makes `npm run dev` and preview deploys work.

That leaves two opposite rules, both in `src/lib/shop-routes.ts` and **never hand-written**:
- storefront `<Link>` hrefs are browser-relative (`shopHref.cart()` → `/cart`);
- storefront `revalidatePath` names the resolved path (`shopPath.cart()` → `/shop/cart`).

Session cookies are host-only, so a client signed in on the shop host is signed out on
the portal host. That isolation is deliberate; don't trade it away.

Sending each audience to its own host happens in the **layouts**, not the proxy: a
cross-host redirect issued from the proxy comes back with its origin stripped and the
browser bounces until `ERR_TOO_MANY_REDIRECTS`.

### Route groups

| Group | Who | Notes |
|---|---|---|
| `src/app/(portal)` | ops staff | dashboard, purchase orders, demand board, buyers, products, upload, review |
| `src/app/(admin)` | super admin only | `/admin` users + permission grid, buyers, catalogue; 404 for everyone else, pinned in the proxy |
| `src/app/(storefront)` | buyers' own contacts, and guests | real paths live under `/shop` |
| `src/app/(auth)` | everyone | sign-in, forgot/reset password, forced password change |

### Layers

- `src/app/**` — Server Components by default; fetch through `src/lib/queries/*`.
- `src/actions/<feature>.ts` — Server Actions. Mutations and anything a client component calls.
- `src/lib/queries/<feature>.ts` — read queries. Selects are **narrow and explicit**;
  several are pinned by equality in tests so a later column cannot leak (e.g.
  `shop-viewer.test.ts`, `shop-stock-leak.test.ts`). Widening one must be a deliberate edit.
- `src/lib/validation/<feature>.ts` — the Zod schemas actions and forms share.
- `src/lib/analytics/*` — pure, no Prisma, heavily unit-tested. Charts and KPIs read these.
- `src/lib/extraction/*` — the Claude call, its schema, its prompt, product matching.
- `src/components/<feature>/` — feature components; `src/components/ui/` is shadcn.

Route handlers exist only where an action cannot serve: Auth.js, upload presign/complete,
product-image presign/complete, document URLs, the review-queue count.

### The intake pipeline

```
presign → browser PUTs to R2 → /api/upload/complete (HEAD, Document + Extraction RUNNING,
bytes → Claude → Zod) → /review/[id] (human reviews the draft) → confirmPurchaseOrder()
→ one transaction: Buyer upsert, PurchaseOrder, LineItems, PoStageEvent(ORDER_PLACED)
```

A shop order enters the same `writePurchaseOrder` at confirm, so both intakes produce the
same rows. A purchase order then moves through six `PoStage` values, each stage advance
owned by a role.

## Conventions that bite if ignored

- **Prisma client is generated into the repo**: import from `@/generated/prisma/client`
  and `@/generated/prisma/enums`, never `@prisma/client`. Run `prisma generate` after a
  schema change, and **restart the dev server** — it holds the old client otherwise.
- **Migrations only via `prisma migrate dev`**, never `db push`. `PurchaseOrder_documentId_fkey`
  has drifted since Phase 16; read generated SQL before accepting it.
- **Every Server Action**: `await requireUser()` (or `requireSuperAdmin()` /
  `requirePermission(key)`) first, Zod-validate, try/catch, return
  `{ success: true, data } | { success: false, error }`. Never throw to the client.
- **Auth guards** (`src/lib/auth-guards.ts`): `requireUser` means *ops staff*, not merely
  signed in — that redefinition is what makes code written later fail closed.
  `requireAccount` is for self-scoped work only, `requireClient` for the shop,
  `requireSuperAdmin` for the admin room.
- **Permissions** are rows, not code (`src/lib/permissions/`). `requirePermission` on the
  server; `can()` only for rendering — a hidden button is not a permission. `SUPER_ADMIN`
  short-circuits to true *without reading the table*, so no saved edit can lock admins out.
- **Money** is `Prisma.Decimal` in the database and `string` across the boundary. Use
  `src/lib/money.ts` (`formatMYR`, `parseMYR`, `sumDecimals`, `formatGrouped`). Never float
  arithmetic. Currency is MYR only.
- **Dates** cross as ISO strings; use `src/lib/dates.ts`. The business timezone is Kuala
  Lumpur. `poDate` is `@db.Date`, so a range bound must go through `dateColumnRange` —
  a raw timestamp truncates to a *UTC* calendar date and admits an extra day.
- **URL is state.** Filters, range, sort, page live in `searchParams`; changing a filter
  resets `page` to 1. Route every URL write through `useUrlNavigation`.
- **Null is not zero.** A blank means "nobody has recorded this" and renders `—`; it sorts
  last in both directions. A zero is a counted zero.
- **Tailwind v4 is CSS-configured.** Never create `tailwind.config.ts`. Tokens live in
  `src/app/globals.css` under `@theme`. `max-w-<name>` resolves against `--spacing-<name>`
  before `--container-<name>`, which is why panel widths use `--container-panel-*`.
- **Products are sold by the carton.** A product's `market` is its destination or its
  retail customer — never its country of origin.
- **`prisma/seed.ts`'s landscaping catalogue is fiction**, left from the project's first
  days. The real catalogue came from `scripts/import-catalog.ts`; `PRODUCT_CATEGORIES` in
  `src/lib/product-categories.ts` is the true category list.

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
palette, sentence-case labels (with **Title Case for a destination's name**,
the sidebar and phone tab bar alone), truncation recovery, and the rule that a
KPI never renders zero on first paint — live in `docs/specs/00-master.md` §4
"Design conventions". Read those too before building UI.

Two floors that are not negotiable: **44px touch targets** below `sm`, and **no
horizontal page overflow** at 390 / 768 / 1440. Both have been broken by changes that
built, typechecked and passed every test — measure in a browser.

## Specs

`docs/specs/00-master.md` first: §4 architecture and design conventions, §5 the data
model, §7 routes and files, §9 the definition of done. Then the numbered phase file for
the feature in hand. `docs/specs/SETUP-CHECKLIST.md` covers the external services.

## Environment notes

- `.env.local` is required and is not in the repo; `.env.example` lists the keys and
  `src/lib/env.ts` is the schema (it throws at import on a bad key).
- `src/lib/prisma.ts` connects through `PrismaNeon`, the Neon **serverless WebSocket**
  driver. A plain local Postgres will not serve the app without swapping the adapter.
- `xlsx` installs from cdn.sheetjs.com, which some sandboxes answer 403 to; when it is
  missing, `catalog-import.test.ts` fails to import and nothing else does.
- `vercel.json` runs `prisma migrate deploy` **only when `VERCEL_ENV=production`** — a
  preview build used to migrate the production database.
