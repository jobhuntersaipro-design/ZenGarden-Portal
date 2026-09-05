# ZenGarden Portal — Master Spec

Version 1.0 — 2026-09-04. Owner: Chris Lam. Audience: AI coders.

**How to use this spec set.** Read this file completely, then read the one
phase file named in `context/current-feature.md`. Read
`docs/specs/design/zengarden-portal-design.md` (the "design reference") for
the screen you are building and open the Claude Design canvas linked in
`CLAUDE.md` for the pixels. Do not read other phase files unless yours points
to them. Every phase is one branch, one PR, one entry in the history table of
`context/current-feature.md`.

Precedence when documents disagree: the canvas wins for visuals, this master
wins for data model and architecture, the phase file wins for behaviour and
acceptance criteria, the design reference wins for copy and component detail.

---

## 1. Product

| | |
|---|---|
| Name | ZenGarden Portal |
| Users | Internal ops staff, one org, roles `MEMBER` and `SUPER_ADMIN` |
| Job | Get customer POs out of attachments into a queryable database without retyping, then track fulfillment and see sales, buyer and product trends |
| Buyer | The customer who issued the PO. Called "buyer" everywhere |
| Auth | Google sign-in with admin approval, or email + password set by an admin |
| Currency | MYR only. Money renders `RM 12,400.00`, never abbreviated in KPIs |
| Files | PDF, PNG, JPG, max 20 MB each |
| Timezone | `Asia/Kuala_Lumpur` for every date shown and every bucket boundary |

Core loop: **Upload → Extract → Review → Confirm → Fulfil → Browse.**

Fulfillment stages, ordered: *Order placed → In production → QC passed → In
warehouse → Delivering → Delivered.* Any member advances one step; only super
admins move back.

Screens (design reference §3): Sign in, Access pending, Dashboard, Upload,
Review, Purchase orders, PO detail, Buyers, Buyer detail, Products, Product
detail, Admin.

## 2. Decisions log

| Topic | Decision |
|---|---|
| Hosting | Vercel. Extraction runs inline in the upload-complete route with `maxDuration = 120` (needs Pro or Fluid compute). If p95 extraction exceeds 60 s in production, move to a queue in a later phase |
| Build order | Real data from day one. No mock module. A deterministic seed (`prisma/seed.ts`) generates ~400 POs so every screen has data |
| Unknown Google email | Creates an `AccessRequest`; super admins get an email; approval in `/admin`. Optional `AUTO_APPROVE_DOMAIN` admits a Workspace domain instantly as Member |
| Duplicate PO (same buyer + PO number) | Warn on the review screen, allow override by ticking "This is a revised PO". Saved as a new row with `revision = n+1` and `revisionOfId` pointing at the previous row. Dashboards count only the latest revision |
| Old `/dashboard` and Respond.io crawler | Retired in Phase 01 (files deleted, scripts removed) |
| Email | Resend from `portal@zengarden.my` (custom domain, verified). `EMAIL_FROM` env var |
| UI primitives | shadcn (base-nova preset, Radix) re-skinned to the `@theme` tokens. No shadcn default colours survive |
| Charts | Recharts 3 for the line chart and stacked bar chart. CSS/SVG hand-written for donuts, horizontal bars, sparklines, status bars, stepper |
| Validation | Zod 4 at every boundary: Server Action input, route handler body, Claude output, env |
| Nav model (2026-09-05) | Upload left the sidebar. It is an action, reached by the "Upload PO" primary button, not a fifth destination |
| Dashboard order (2026-09-05) | Work queue first and heaviest, then a compact KPI row, then one trend, then the status bars. Market share, In this range, churn and drift sit behind a "More analytics" disclosure |
| Confirm gate (2026-09-05) | A PO whose computed total disagrees with the document cannot be confirmed until the numbers agree or the reviewer explicitly acknowledges the difference, which is written to the activity log |
| Tests | Vitest for `src/lib/analytics/**`, `src/lib/po-stages.ts`, `src/lib/money.ts`, extraction schema. Playwright smoke test for sign-in and upload in Phase 04 |

## 3. Stack and versions

| Concern | Package | Notes |
|---|---|---|
| Framework | `next@16.2`, `react@19.2` | App Router, Server Components default, `proxy.ts` (not `middleware.ts`), async `params` and `searchParams` |
| Styling | `tailwindcss@4`, `@tailwindcss/postcss` | Tokens only from `src/app/globals.css @theme`. No `tailwind.config.*` |
| Primitives | `shadcn@latest` CLI, `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` | Installed to `src/components/ui/` |
| ORM | `prisma@7`, `@prisma/client@7`, `@prisma/adapter-neon`, `@neondatabase/serverless` | `prisma.config.ts` at root, generated client at `src/generated/prisma` |
| Auth | `next-auth@5` (beta channel, "Auth.js"), `@auth/prisma-adapter`, `bcryptjs` | JWT session strategy; role and `mustChangePassword` carried in the token |
| Files | `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | R2 S3 endpoint `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`, region `auto` |
| Images | `sharp` | 1600px WebP derivative for product images |
| Extraction | `@anthropic-ai/sdk` | `client.messages.parse` with `zodOutputFormat`; model `claude-sonnet-5` |
| Email | `resend`, `@react-email/components` | Templates in `src/emails/` |
| Validation | `zod@4` | |
| Charts | `recharts@3` | Already installed |
| Drag to reorder | `@dnd-kit/core`, `@dnd-kit/sortable` | Product image grid only (Phase 08) |
| PDF preview | `react-pdf` (pdf.js) | Client component, reads a presigned GET URL |
| Dates | `date-fns@4`, `@date-fns/tz` | All bucketing in `Asia/Kuala_Lumpur` |
| Tests | `vitest`, `@vitejs/plugin-react`, `playwright` | |
| Scripts | `tsx` | Seed and one-off scripts |

`package.json` scripts after Phase 01:

```
dev            next dev
build          prisma generate && next build
start          next start
lint           eslint
test           vitest run
db:migrate     prisma migrate dev
db:deploy      prisma migrate deploy
db:seed        tsx --env-file=.env.local prisma/seed.ts
db:studio      prisma studio
```

Vercel build command: `prisma generate && prisma migrate deploy && next build`.

## 4. Architecture

```
Browser ──(1) POST /api/upload/presign ──▶ route ──▶ R2 presigned PUT (15 min, Content-Type pinned)
Browser ──(2) PUT file ────────────────▶ R2 (bucket CORS allows PUT from APP_URL)
Browser ──(3) POST /api/upload/complete ▶ route (maxDuration 120)
                                          ├─ HEAD object, verify size + type
                                          ├─ Document row + Extraction RUNNING
                                          ├─ GET object bytes → Claude → PoExtraction (Zod)
                                          └─ Extraction SUCCEEDED | FAILED
Browser ──(4) /review/[extractionId] ────▶ server component reads Extraction.rawJson
Browser ──(5) confirmPurchaseOrder() ────▶ Server Action ▶ Zod ▶ tx: Buyer upsert, PurchaseOrder, LineItems, PoStageEvent(ORDER_PLACED), Extraction → CONFIRMED
```

Rules that apply to every phase:

- **Server Components fetch with Prisma directly.** Client components call
  Server Actions. Route handlers exist only for upload presign/complete,
  product image presign/complete, and Auth.js.
- **Every Server Action** starts with `const session = await requireUser()` (or
  `requireSuperAdmin()`), validates input with a Zod schema exported from
  `src/lib/validation/<feature>.ts`, wraps work in try/catch, and returns
  `{ success: true, data } | { success: false, error }`. Never throws to the client.
- **Money** is `Prisma.Decimal` in the database and `string` across the
  server/client boundary. `src/lib/money.ts` exports `formatMYR(value)`,
  `parseMYR(input)`, `sumDecimals(list)`. Never do arithmetic on floats.
- **Dates** cross the boundary as ISO strings. `src/lib/dates.ts` exports
  `formatDate`, `formatDateTime`, `bucketStart(date, agg)`, `rangeFromPreset`.
- **URL is state.** Filters, ranges, sort, page and page size live in
  `searchParams`; changing any filter resets `page` to 1. No filter state in
  React state that is not also in the URL.
- **Pagination** is server-side, `skip`/`take`, sizes 10/30/50, default 10.
- **Sorting** is server-side on the underlying column, never the formatted string.
- **Every table sorts on every column** (design reference §4) except line-item tables.
- **One `button-primary` per screen.**
- **No raw hex, px or arbitrary Tailwind values** in components. If a token is
  missing, add it to `@theme` first and say so in the PR.
- **Errors reach the user as toasts** (Sonner, restyled per design reference §4).
- **Empty, loading, error states** are specified per screen in the design
  reference; each page ships `loading.tsx` with skeletons.
- **Accessibility**: every interactive element keyboard-reachable, every icon
  button has `aria-label`, focus ring is the 2px `border-primary` from the tokens,
  `prefers-reduced-motion` disables count-up and the stepper breathing.

### Design conventions

These came out of the 2026-09-05 design review and hold on every screen. The
canvas linked from `CLAUDE.md` is the picture of them.

- **Navigation is destinations only.** The sidebar is Dashboard, Purchase
  orders, Buyers, Products. Upload is an action: the `button-primary` "Upload
  PO" in the page header of Dashboard, Purchase orders, Buyers and Buyer
  detail. `/upload` and `/review/[id]` keep "Purchase orders" lit in the
  sidebar. Never add a nav row for an action.
- **One status palette.** A colour means the same thing on every badge, chip,
  dot, queue row and chart segment:

| Meaning | Token |
|---|---|
| Needs review, action required | `brand-amber` |
| Confirmed, active, delivered, success | `accent-green` |
| Failed, overdue, destructive risk | `accent-red` |
| A process in flight — uploading, extracting, in production, delivering | `accent-blue` |
| Pending access, invited | `ink-secondary` text with a 1px `brand-amber` ring |
| Disabled, inactive | `ink-tertiary` |

  `accent-blue` means *something is happening right now*. An overdue reorder is
  not a process, so it is red; a new buyer is not a process, so it is neutral.
  Status is coloured text on `surface-soft`, never a coloured fill — the one
  exception is a chart segment, which is a legend swatch and always labelled.
  Every status carries its text label; colour alone never carries meaning.
- **Sentence case.** Eyebrows, field labels and table column headers keep
  Sometype Mono (`font-mono`, `text-eyebrow`, `text-ink-tertiary`) but are not
  uppercased. This is a deliberate departure from the ClickUp system's
  all-caps eyebrow, taken because these labels are read on every pass and the
  caps slowed scanning; the mono family still marks them as chrome. See the
  note at the top of `context/design-system.md`.
- **Truncation always has a way back.** Any text that ellipsises carries a
  `title` with the full value, and a focused input shows its value in full
  rather than clipped. Better still, give the important field room: the review
  form puts Buyer on its own full-width row so a buyer's name is never the
  thing that gets cut.
- **Numbers render final, then animate.** A count-up must never be the initial
  paint. Server-render the real value, animate from it only on the client,
  skip the animation under `prefers-reduced-motion`, and never restart it when
  a filter, range or toggle changes. A KPI that shows `RM 0.00` for 900ms
  reads as a data bug — it was reported as one from a PDF export of the canvas.
- **A number and the table under it must agree.** Any KPI, summary line or
  headline is computed from the same dataset and the same window as the rows
  it sits above. When a tile covers all records and the summary reflects the
  active filter, label both, and make them identical when no filter is on.

## 5. Data model

`prisma/schema.prisma`. Provider `postgresql`. Generator `prisma-client`,
output `../src/generated/prisma`. Migrations only via `prisma migrate dev`.

```prisma
model User {
  id                 String    @id @default(cuid())
  email              String    @unique
  name               String
  image              String?
  emailVerified      DateTime?                 // Auth.js adapter field
  role               Role      @default(MEMBER)
  passwordHash       String?                   // null = no password; Google always works
  mustChangePassword Boolean   @default(false)
  sessionVersion     Int       @default(0)   // bumped to sign a user out everywhere; compared in the jwt callback
  disabledAt         DateTime?
  lastActiveAt       DateTime?
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  accounts           Account[]
  documents          Document[]
  confirmedOrders    PurchaseOrder[] @relation("confirmedBy")
  stageEvents        PoStageEvent[]
  passwordResets     PasswordResetToken[]
  productPrices      ProductPrice[]
}

enum Role { SUPER_ADMIN MEMBER }

// Auth.js adapter tables. Session table is omitted: JWT strategy.
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime
  @@unique([identifier, token])
}

model PasswordResetToken {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String   @unique                  // sha256 of the emailed token
  expiresAt DateTime                          // now + 30 min
  usedAt    DateTime?
  createdAt DateTime @default(now())
}

model LoginAttempt {
  id        String   @id @default(cuid())
  email     String
  ip        String
  success   Boolean
  at        DateTime @default(now())
  @@index([email, at])
  @@index([ip, at])
}

model AccessRequest {
  id        String              @id @default(cuid())
  email     String              @unique
  name      String
  image     String?
  status    AccessRequestStatus @default(PENDING)
  firstSeen DateTime            @default(now())
  lastSeen  DateTime            @updatedAt
  decidedById String?
  decidedAt DateTime?
}

enum AccessRequestStatus { PENDING APPROVED DECLINED }

model Buyer {
  id             String          @id @default(cuid())
  name           String          @unique
  contactName    String?
  email          String?
  phone          String?
  address        String?
  paymentTerms   String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  purchaseOrders PurchaseOrder[]
}

model Document {
  id            String     @id @default(cuid())
  r2Key         String     @unique            // po/{yyyy}/{mm}/{documentId}.{ext}
  originalName  String
  mimeType      String                        // application/pdf | image/png | image/jpeg
  sizeBytes     Int
  pageCount     Int?                          // PDFs only, from extraction
  uploadedById  String
  uploadedBy    User       @relation(fields: [uploadedById], references: [id])
  uploadedAt    DateTime   @default(now())
  extraction    Extraction?
  purchaseOrder PurchaseOrder?
}

model Extraction {
  id          String           @id @default(cuid())
  documentId  String           @unique
  document    Document         @relation(fields: [documentId], references: [id], onDelete: Cascade)
  status      ExtractionStatus @default(PENDING)
  rawJson     Json?                          // PoExtraction as returned by Claude, untouched
  draftJson   Json?                          // reviewer's edits, saved on every change
  confidence  Int?                           // 0-100 overall
  error       String?
  model       String?
  inputTokens Int?
  outputTokens Int?
  startedAt   DateTime?
  finishedAt  DateTime?
  discardedAt DateTime?
  createdAt   DateTime         @default(now())
  @@index([status])
}

enum ExtractionStatus { PENDING RUNNING SUCCEEDED FAILED CONFIRMED DISCARDED }

model PurchaseOrder {
  id             String    @id @default(cuid())
  poNumber       String
  revision       Int       @default(1)
  revisionOfId   String?   @unique
  revisionOf     PurchaseOrder? @relation("revisions", fields: [revisionOfId], references: [id])
  supersededBy   PurchaseOrder? @relation("revisions")
  buyerId        String
  buyer          Buyer     @relation(fields: [buyerId], references: [id])
  poDate         DateTime  @db.Date
  deliveryDate   DateTime? @db.Date
  currency       String    @default("MYR")
  buyerReference String?
  paymentTerms   String?
  subtotal       Decimal   @db.Decimal(14, 2)
  tax            Decimal   @db.Decimal(14, 2)
  total          Decimal   @db.Decimal(14, 2)
  notes          String?
  documentId     String    @unique
  document       Document  @relation(fields: [documentId], references: [id])
  confirmedById  String
  confirmedBy    User      @relation("confirmedBy", fields: [confirmedById], references: [id])
  confirmedAt    DateTime  @default(now())
  stage          PoStage   @default(ORDER_PLACED)
  stageChangedAt DateTime  @default(now())
  stageEvents    PoStageEvent[]
  lineItems      LineItem[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@unique([buyerId, poNumber, revision])
  @@index([poDate])
  @@index([stage])
  @@index([buyerId, poDate])
}

// Ordered. Add future stages by appending here AND in src/lib/po-stages.ts.
enum PoStage { ORDER_PLACED IN_PRODUCTION QC_PASSED IN_WAREHOUSE DELIVERING DELIVERED }

model PoStageEvent {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  kind            PoEventKind   @default(STAGE)
  fromStage       PoStage?
  toStage         PoStage
  note            String?
  changedById     String?                    // null = System (confirm-time event)
  changedBy       User?         @relation(fields: [changedById], references: [id])
  changedAt       DateTime      @default(now())
  @@index([purchaseOrderId, changedAt])
}

enum PoEventKind { STAGE EDIT }   // EDIT rows record field edits on the detail page; analytics ignore them

model Product {
  id          String         @id @default(cuid())
  sku         String         @unique
  name        String
  category    String
  unit        String
  listPrice   Decimal        @db.Decimal(14, 2)
  description String?
  active      Boolean        @default(true)
  images      ProductImage[]
  prices      ProductPrice[]
  lineItems   LineItem[]
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
}

model ProductPrice {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  price     Decimal  @db.Decimal(14, 2)
  from      DateTime @default(now())
  setById   String
  setBy     User     @relation(fields: [setById], references: [id])
  @@index([productId, from])
}

model ProductImage {
  id        String   @id @default(cuid())
  productId String
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  r2Key     String   @unique                 // products/{productId}/{id}.{ext}
  thumbKey  String?                          // products/{productId}/{id}.1600.webp
  position  Int                              // 0 = thumbnail
  sizeBytes Int
  createdAt DateTime @default(now())
  @@unique([productId, position])
}

model LineItem {
  id              String        @id @default(cuid())
  purchaseOrderId String
  purchaseOrder   PurchaseOrder @relation(fields: [purchaseOrderId], references: [id], onDelete: Cascade)
  position        Int
  description     String                     // as printed on the PO
  productId       String?                    // matched during review; null if unmatched
  product         Product?      @relation(fields: [productId], references: [id])
  quantity        Decimal       @db.Decimal(12, 3)
  unit            String?
  unitPrice       Decimal       @db.Decimal(14, 4)
  amount          Decimal       @db.Decimal(14, 2)
  @@unique([purchaseOrderId, position])
  @@index([productId])
}
```

Invariants:

- A `PurchaseOrder` row exists only after a person clicked Confirm. Drafts live
  in `Extraction.draftJson`. There is no `NEEDS_REVIEW` status on
  `PurchaseOrder`; the intake status shown in lists comes from `Extraction.status`.
- A "PO in the list" is the union of confirmed `PurchaseOrder`s and
  `Extraction`s in `RUNNING | SUCCEEDED | FAILED` (the backlog). Phase 05
  defines the merged list query.
- `PurchaseOrder.stage` is the denormalised current value. `PoStageEvent` rows with
  `kind = STAGE` are the source of truth for timelines and lead-time statistics;
  `kind = EDIT` rows only feed the Activity list.
- Dashboards and buyer/product analytics exclude superseded revisions
  (`supersededBy IS NULL`).
- `src/lib/po-stages.ts` exports `PO_STAGES: readonly { value, label, token }[]`
  in order, plus `nextStage`, `prevStage`, `stageIndex`. Every screen reads
  labels and colours from it.

## 6. Environment

`.env.example` is committed; `.env.local` is not. `src/lib/env.ts` parses all
of these with Zod at import time and fails the build if one is missing.

```
# App
APP_URL=http://localhost:3000            # public origin, used in emails and R2 CORS
AUTH_SECRET=                             # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTO_APPROVE_DOMAIN=                     # optional, e.g. zengarden.my
SEED_SUPER_ADMIN_EMAIL=                  # your Google email; seed creates this user as SUPER_ADMIN

# Neon
DATABASE_URL=                            # pooled connection string (-pooler host)
DIRECT_URL=                              # direct connection string, migrations only

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=zengarden-portal

# Resend
RESEND_API_KEY=
EMAIL_FROM="ZenGarden Portal <portal@zengarden.my>"

# Anthropic
ANTHROPIC_API_KEY=
EXTRACTION_MODEL=claude-sonnet-5
```

## 7. Routes and files

```
src/proxy.ts                                   auth guard, /admin 404 for non-super-admins
src/app/layout.tsx                             fonts (Plus Jakarta Sans, Inter, Sometype Mono via next/font), Toaster
src/app/(auth)/signin/page.tsx
src/app/(auth)/signin/pending/page.tsx
src/app/(auth)/forgot-password/page.tsx
src/app/(auth)/reset-password/[token]/page.tsx
src/app/(auth)/account/password/page.tsx       forced change when mustChangePassword
src/app/(portal)/layout.tsx                    App Shell (Sidebar + content column)
src/app/(portal)/page.tsx                      Dashboard
src/app/(portal)/upload/page.tsx
src/app/(portal)/review/[id]/page.tsx          id = Extraction.id
src/app/(portal)/purchase-orders/page.tsx
src/app/(portal)/purchase-orders/[id]/page.tsx
src/app/(portal)/buyers/page.tsx
src/app/(portal)/buyers/[id]/page.tsx
src/app/(portal)/products/page.tsx
src/app/(portal)/products/[id]/page.tsx
src/app/(admin)/admin/layout.tsx               admin top bar, not the sidebar
src/app/(admin)/admin/page.tsx
src/app/api/auth/[...nextauth]/route.ts
src/app/api/upload/presign/route.ts
src/app/api/upload/complete/route.ts           maxDuration = 120
src/app/api/upload/[documentId]/route.ts       DELETE, owner-only, before extraction exists
src/app/api/documents/[id]/url/route.ts        short-lived presigned GET for preview/download
src/app/api/products/[id]/images/presign/route.ts
src/app/api/products/[id]/images/complete/route.ts
src/actions/auth.ts                            requestPasswordReset, resetPassword, changePassword
src/actions/purchase-orders.ts                 saveDraft, confirmPurchaseOrder, discardExtraction, retryExtraction, updatePurchaseOrder, advanceStage, revertStage
src/actions/buyers.ts                          updateBuyer
src/actions/products.ts                        createProduct, updateProduct, archiveProduct, reorderImages, deleteImage
src/actions/users.ts                           createUser, updateUser, setPassword, disableUser, deleteUser
src/actions/access-requests.ts                 approveAccessRequest, declineAccessRequest
src/lib/env.ts · prisma.ts · auth.ts · auth-guards.ts · r2.ts · email.ts · money.ts · dates.ts · po-stages.ts · rate-limit.ts · utils.ts
src/lib/validation/{auth,purchase-orders,buyers,products,users}.ts
src/lib/extraction/{extract-po.ts,schema.ts,prompt.ts}
src/lib/queries/{purchase-orders,buyers,products,users,dashboard}.ts   read-side helpers used by pages
src/lib/analytics/{buckets,sales,fulfillment,churn,price-drift,reorder,share}.ts  pure functions, unit tested
src/emails/{AccessRequested,AccessApproved,AccessDeclined,PasswordReset,TemporaryPassword}.tsx
src/components/ui/*                            shadcn primitives (generated, then re-skinned)
src/components/portal/*                        app components, one per file, PascalCase
src/components/charts/{SalesLineChart,StackedStageChart,DonutShare,HBarList,Sparkline,StatusBar}.tsx
src/hooks/{useCountUp,useUrlState,useDebounce}.ts
src/types/{purchase-order,buyer,product,user,analytics}.ts
prisma/schema.prisma · prisma/seed.ts · prisma/seed/{rng,buyers,products,orders}.ts
prisma.config.ts · vitest.config.ts · components.json · vercel.json
```

## 8. Phases

| # | File | Branch | Delivers |
|---|---|---|---|
| 01 | `01-foundation.md` | `feature/foundation` | Deps, shadcn, Prisma + Neon, R2 and Resend libs, seed, App Shell, retire old dashboard |
| 02 | `02-auth.md` | `feature/auth` | Sign in (Google + password), access requests, password reset, proxy guard |
| 03 | `03-upload.md` | `feature/upload` | Dropzone, presigned R2 upload, queue UI, Document rows |
| 04 | `04-extraction-review.md` | `feature/extraction-review` | Claude extraction, review screen, confirm, duplicates, discard/retry |
| 05 | `05-purchase-orders.md` | `feature/purchase-orders` | PO list with filters, PO detail, lifecycle stepper, stage actions, document preview |
| 06 | `06-dashboard.md` | `feature/dashboard` | Range controls, KPIs, line chart, stacked bars, donuts, churn, drift, status bars |
| 07 | `07-buyers.md` | `feature/buyers` | Buyers roster, buyer detail, reorder signals, product order trend |
| 08 | `08-products.md` | `feature/products` | Catalog grid/list, product detail, price history, images to R2 |
| 09 | `09-admin.md` | `feature/admin` | User management, access-request approval, admin drawer |

Phases run in order. 06, 07 and 08 only depend on 05 and may run in parallel
on separate branches if rebased carefully.

## 9. Definition of done (every phase)

1. Every acceptance criterion in the phase file passes in the browser at
   `http://localhost:3000` against seeded data.
2. `npm run lint`, `npm run test` and `npm run build` pass with zero warnings
   introduced by the branch.
3. `prisma migrate status` reports no drift. Any schema change has a migration
   with a descriptive name.
4. No raw hex, px font sizes or arbitrary Tailwind values in `src/components`
   or `src/app` (`grep -rnE "#[0-9a-fA-F]{6}|\[[0-9]+px\]" src/app src/components` is empty,
   excluding `globals.css`).
5. The design conventions in §4 hold: the sidebar carries no action rows; every
   status colour matches the palette table and carries a text label; no
   `uppercase` on an eyebrow, label or column header; every ellipsised value has
   a `title`; no KPI renders zero on first paint; every headline number agrees
   with the table beneath it.
6. Every screen matches the Claude Design canvas at 1440 wide, and is usable
   at 1024 (sidebar stays, content column shrinks) and 768 (sidebar collapses
   to icons; tables scroll horizontally inside their card).
7. `context/current-feature.md` is updated and the branch is ready to merge.
   Do not commit or merge without the owner's go-ahead.
