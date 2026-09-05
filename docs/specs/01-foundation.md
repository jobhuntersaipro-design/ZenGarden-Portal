# Phase 01 — Foundation

Branch `feature/foundation`. Depends on: nothing. Read `00-master.md` first.

Goal: after this phase a coder can run `npm run dev`, sign nothing in yet, but
see the App Shell at `/` rendering "Dashboard" as a placeholder page over a
seeded Neon database, with R2, Resend and Claude clients ready to import.

## 1. Retire the old dashboard

Delete, in one commit titled `chore: retire Respond.io dashboard and crawler`:

```
src/app/dashboard/            src/components/dashboard/
src/lib/dashboard/            src/lib/respond-io/
respond-io-chat-spec.md (if present)   any data/*.json or exports the crawler wrote
```

Remove the four `crawl*` scripts from `package.json`. Remove `recharts` only if
it is now unused (it is not; Phase 06 uses it, so keep it). Replace
`src/app/page.tsx` with the placeholder from §6. Update
`context/current-feature.md` so the Respond.io entry is marked retired in the
history table.

## 2. Dependencies

```
npm i @prisma/client @prisma/adapter-neon @neondatabase/serverless next-auth@beta @auth/prisma-adapter bcryptjs \
      @aws-sdk/client-s3 @aws-sdk/s3-request-presigner sharp @anthropic-ai/sdk resend @react-email/components \
      zod date-fns @date-fns/tz react-pdf class-variance-authority clsx tailwind-merge lucide-react radix-ui sonner
npm i -D prisma vitest @vitejs/plugin-react @types/bcryptjs
```

Pin the versions that install today in `package.json` (no `^` on `next-auth`).

## 3. shadcn

```
npx shadcn@latest init -t next -b radix --css-variables
npx shadcn@latest add button input textarea select checkbox switch dialog sheet popover tooltip table skeleton sonner separator dropdown-menu avatar
```

`components.json`: `style` from the preset, `tailwind.css` →
`src/app/globals.css`, `baseColor` neutral, aliases `@/components`,
`@/components/ui`, `@/lib/utils`, `@/hooks`, icon library lucide.

Then **re-skin**. shadcn writes a `:root { --background … }` block and an
`@theme inline` block into `globals.css`. Keep the `@theme inline` block but
point every shadcn variable at a design token so the primitives inherit the
system without touching component files:

```css
:root {
  --background: var(--color-canvas);
  --foreground: var(--color-ink);
  --card: var(--color-canvas);
  --card-foreground: var(--color-ink);
  --popover: var(--color-canvas);
  --popover-foreground: var(--color-ink);
  --primary: var(--color-ink);                 /* dark pill, never purple */
  --primary-foreground: var(--color-canvas);
  --secondary: var(--color-surface-soft);
  --secondary-foreground: var(--color-ink);
  --muted: var(--color-surface);
  --muted-foreground: var(--color-ink-secondary);
  --accent: var(--color-surface);
  --accent-foreground: var(--color-ink);
  --destructive: var(--color-accent-red);
  --border: var(--color-hairline);
  --input: var(--color-hairline-strong);
  --ring: var(--color-primary);                /* 2px purple focus ring */
  --radius: var(--radius-sm);                  /* 9px inputs and secondary buttons */
}
```

Delete the `.dark` block shadcn adds; the product is light-only. Add to
`@theme`: `--spacing-control-lg: 52px` (primary pill), `--spacing-control-md: 44px`
(inputs, secondary buttons), `--spacing-control-sm: 36px` (chips, page-size
select), the six `--color-stage-1` … `--color-stage-6` values from the design
reference §4 "Stage palette", and a `tabular-nums` utility. Then edit
`src/components/ui/button.tsx` so the variants are: `default` = dark pill
(`bg-ink text-canvas rounded-pill h-control-lg hover:bg-ink-deep`),
`secondary` = `bg-surface-soft border border-hairline rounded-sm h-control-md hover:border-hairline-strong`,
`ghost` = tertiary text link (`text-brand-link hover:text-primary`), and a new
`gradient` variant on `bg-brand-gradient text-canvas rounded-pill`. Input,
Select trigger and Textarea get `h-control-md rounded-sm border-hairline-strong focus-visible:border-primary`.

Fonts: in `src/app/layout.tsx` load `Plus_Jakarta_Sans`, `Inter` and
`Sometype_Mono` from `next/font/google` with the CSS variable names
`globals.css` already expects (`--font-plus-jakarta-sans`, `--font-inter`,
`--font-sometype-mono`).

## 4. Prisma + Neon

- `npx prisma init --datasource-provider postgresql` then replace the schema
  with `00-master.md §5` verbatim.
- `prisma.config.ts`:

```ts
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx --env-file=.env.local prisma/seed.ts" },
  datasource: { url: env("DIRECT_URL") },
});
```

- `src/lib/prisma.ts`: singleton `PrismaClient` with `new PrismaNeon({ connectionString: env.DATABASE_URL })`,
  cached on `globalThis` outside production.
- `src/lib/env.ts`: Zod object over `process.env` for every key in
  `00-master.md §6`; `AUTO_APPROVE_DOMAIN` and `SEED_SUPER_ADMIN_EMAIL` optional.
  Export `env`. Import it from `prisma.ts`, `r2.ts`, `email.ts`, `auth.ts`.
- First migration: `npx prisma migrate dev --name init`.
- Add the `db:*` scripts from `00-master.md §3`; `build` becomes `prisma generate && next build`.

## 5. Seed

`prisma/seed.ts` orchestrates `prisma/seed/{rng,buyers,products,orders}.ts`.
Shape is the design reference §5, restated as rules:

- Seeded RNG (mulberry32, seed `20260904`) so re-running produces identical data.
- Users: `SEED_SUPER_ADMIN_EMAIL` as SUPER_ADMIN named from the local part of the
  email; plus "Aisha Rahman" `aisha@lovinghands.my` MEMBER with `passwordHash` of
  `Password123!` and `mustChangePassword = true`. Both get `image = null`.
- 11 buyers and 12 products with the names, categories, units, base prices and
  drift from the design reference §5. Three products have no images. Each
  product gets one `ProductPrice` row dated 2025-09-01 at its base price.
- ~400 POs from 2025-09-04 to yesterday: 0–3 per weekday, ~15% of Saturdays,
  none on Sundays; buyer skew so the top three carry ~55% of value; 2–6 line
  items each, `productId` set, `description` = product name; unit price = base
  × (1 + drift × years since 2025-09-01) × (1 ± 2%); tax 0 (SST not on these
  goods); totals between RM 1k and RM 150k. Each PO has a `Document` row with a
  fake `r2Key` (`seed/{id}.pdf`, `sizeBytes` 200k–2M, `pageCount` 1–3) and an
  `Extraction` row `CONFIRMED` with `rawJson` equal to the confirmed data and
  `confidence` 82–99.
- Intake backlog: 6 extra `Extraction`s without a `PurchaseOrder` in the last
  2 days — 3 `SUCCEEDED` (needs review), 2 `RUNNING`, 1 `FAILED` with an error
  string. Their `rawJson` holds plausible data so Phase 04 can open them.
- Stage from age with ±3 days noise: <3 d ORDER_PLACED, <8 IN_PRODUCTION,
  <12 QC_PASSED, <16 IN_WAREHOUSE, <20 DELIVERING, else DELIVERED; stage
  events generated backwards from the PO date so lead time is 12–22 days.
  `changedById` alternates between the two users; the first event is System.
- Idempotent: `seed.ts` refuses to run against a database that already has
  POs unless `--reset` is passed, in which case it truncates every table
  except `_prisma_migrations`.

## 6. Service clients (skeletons, exercised in later phases)

- `src/lib/r2.ts`: `r2` S3Client (endpoint from `R2_ACCOUNT_ID`, region
  `auto`, `forcePathStyle` false); `presignPut(key, contentType, maxBytes)`
  15 min; `presignGet(key, filename?)` 10 min with
  `ResponseContentDisposition`; `headObject(key)`; `getObjectBytes(key)`;
  `deleteObject(key)`; `documentKey(documentId, ext)` → `po/{yyyy}/{mm}/{id}.{ext}`
  in KL time.
- `src/lib/email.ts`: `resend` client; `sendEmail({ to, subject, react })`
  wrapping `resend.emails.send` with `from: env.EMAIL_FROM`; logs and swallows
  errors in development when `RESEND_API_KEY` is empty. `src/emails/` gets a
  `Layout.tsx` (wordmark, ink text, hairline rule) the Phase 02 templates use.
- `src/lib/money.ts`, `src/lib/dates.ts`, `src/lib/po-stages.ts` per
  `00-master.md §4–5`, each with a Vitest file beside it.
- `src/lib/auth-guards.ts`: `requireUser()` and `requireSuperAdmin()` that
  throw a typed `UnauthorizedError`; Phase 02 makes them real, Phase 01 ships
  them reading a stub session so pages compile.
- `src/hooks/useUrlState.ts`: `[value, set]` over a named `searchParams` key with
  `router.replace`, resetting `page` when any other key changes.
- `vitest.config.ts` with the react plugin and `@` alias; `npm test` runs.
- `vercel.json`: `{ "functions": { "src/app/api/upload/complete/route.ts": { "maxDuration": 120 } } }`
  (belt and braces with the route's own `export const maxDuration`).

## 7. App Shell

`src/app/(portal)/layout.tsx` and `src/components/portal/{Sidebar,PageHeader,UserMenu}.tsx`
per design reference §3.0. Nav rows: Dashboard `/`, Purchase orders
`/purchase-orders`, Buyers `/buyers`, Products `/products`, Upload `/upload`,
each with a lucide icon (`LayoutDashboard`, `FileText`, `Users`, `Package`,
`Upload`). Active state from `usePathname`. The user row at the bottom shows
the seeded super admin for now (hard-coded until Phase 02) and opens a
`DropdownMenu` with "Sign out" (no-op until Phase 02). Below 1024 the
sidebar collapses to a 64px icon rail with tooltips.

`src/app/(portal)/page.tsx`: `PageHeader` eyebrow "OVERVIEW", h1 "Dashboard",
and one `card-feature` containing the text "Dashboard arrives in Phase 06" plus
the seeded PO count fetched with Prisma, proving the database round-trip.

Each of the other portal routes gets a stub page with its `PageHeader` so the
nav works; each phase replaces its stub.

## 8. Acceptance criteria

1. `npm run build`, `npm run lint`, `npm test` pass.
2. `npm run db:migrate` creates the schema on Neon; `prisma migrate status` clean.
3. `npm run db:seed` finishes under 60 s; re-running without `--reset` exits
   with a clear message; `--reset` produces identical row counts.
4. `/` renders the shell with the design tokens (dark pill button visible in
   the header slot, Plus Jakarta Sans on the h1) and shows the seeded PO count.
5. `src/components/ui/button.tsx` default variant is the ink pill; no purple fill anywhere.
6. `git grep -nE "#[0-9a-fA-F]{6}" src/app src/components ':!src/app/globals.css'` returns nothing.
7. No references to `respond-io` or `src/lib/dashboard` remain (`git grep -n respond` empty).
