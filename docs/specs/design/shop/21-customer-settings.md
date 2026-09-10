# Phase 21 — Customer settings: profile, company, documents

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A buyer's contact can change their picture, name and password; read the company details we hold and ask us to change them; and keep documents against their company — a signed PO, a delivery photo, a registration certificate — beside the purchase orders the shop generated.

**Architecture:** `/settings` on the shop host with three URL tabs. Profile reuses the portal's `ProfileCard` and `SecurityCard`; the profile actions and the avatar upload route move from `requireUser()` to `requireAccount()`, which is what they always meant — they act on the caller's own row. Company is a read-only card over `Buyer`. Documents is a new `BuyerDocument` table with the Phase 03 presign → PUT → complete shape behind client-scoped routes, listed together with Phase 19's generated purchase orders.

**Tech Stack:** As 17, plus the upload machinery pattern from `src/hooks/useImageUploadQueue.ts`, `react-pdf` through `DocumentPreview`, `sharp` (already traced for `/api/avatars`).

**Spec:** this file, `00-overview.md`, the prototype's *Settings* view (`Shop.dc.html`, `isAccount` — three tabs). Read `docs/specs/10-settings-and-avatars.md` and `15-client-accounts.md` §2 and §8.

**Branch:** `feature/shop-settings`. Depends on 19 (the URL route and the generated documents in the list); independent of 20 and 22.

## Global constraints

- Phase 17's, unchanged.
- A client reaches only their own buyer's documents; scoping is in the `where`, never a comparison afterwards; another buyer's id is a 404 on the wire.
- Client uploads follow `src/lib/validation/upload.ts` exactly: PDF, PNG, JPG, 20 MB, ten a call — and the reasons shown are its strings.
- The generated purchase orders are listed but never deletable from here.
- `signOutEverywhere` stays `requireUser()`; nothing else in `profile.ts` does.
- R2 CORS must allow the shop origin (SETUP-CHECKLIST §6.1 step 2) or the PUT fails its preflight — the 2026-09-07 failure, on a new host.

---

## 0. Why this exists

Phase 15 gave a client a password change and nothing else, on purpose: a settings screen was a phase of its own. This is it. The canvas draws three tabs, and two of them are deliberately quiet — the company details are what we invoice and deliver against, so they are read here and changed by a message to our team. The third is the one with a write path: a place to put the paper that goes with an order.

## 1. Data model

```prisma
model BuyerDocument {
  id           String    @id @default(cuid())
  buyerId      String
  buyer        Buyer     @relation(fields: [buyerId], references: [id])
  uploadedById String
  uploadedBy   User      @relation("buyerDocumentsUploaded", fields: [uploadedById], references: [id])
  /// buyers/{buyerId}/{id}.{ext}; a `pending:` placeholder until the browser has uploaded.
  r2Key        String    @unique
  originalName String
  mimeType     String
  sizeBytes    Int
  /// Null until /complete verified the object. A row still null an hour later was abandoned.
  completedAt  DateTime?
  createdAt    DateTime  @default(now())

  @@index([buyerId, createdAt])
}
```

`Buyer.documents BuyerDocument[]`, `User.buyerDocuments BuyerDocument[] @relation("buyerDocumentsUploaded")`. Migration `20260913100000_buyer_documents`. A separate table rather than a `buyerId` on `Document`, because `Document` is the intake queue: `deleteOrphans`, the review list's draft branch and `findOwnedDocument` all reason about it, and every one of them would need a new exclusion.

`src/lib/r2.ts` gains `buyerDocumentKey(buyerId, id, ext)` → `buyers/{buyerId}/{id}.{ext}`.

## 2. Profile actions open to a client

`updateProfile`, `setGeneratedAvatar` and `removeAvatar` in `src/actions/profile.ts` change their guard to `requireAccount()`; so does `POST /api/avatars` (the upload). `GET /api/avatars/[userId]` becomes `requireAccount()` plus *staff, or the caller's own id* — a client may fetch their own picture and nobody else's. `signOutEverywhere` keeps `requireUser()`. `src/lib/auth-guards.test.ts`'s table gains the four rows; `profile.test.ts` gains "a CLIENT may update their own name". This reverses the Phase 15 §2 line that left these on `requireUser()`, and the reason is the one that line gave: clients now get a settings screen.

The shop layout mounts `AvatarSavingProvider` and `AvatarChangeListener` so the header picture takes the saving ring and a change reaches other tabs, exactly as the portal shell does.

## 3. Routes

| Browser path | File |
|---|---|
| `/settings?tab=profile\|company\|documents` | `src/app/(storefront)/shop/settings/page.tsx` |
| `POST /api/shop/documents/presign` | `src/app/api/shop/documents/presign/route.ts` |
| `POST /api/shop/documents/complete` | `src/app/api/shop/documents/complete/route.ts` |
| `GET /api/shop/documents/[documentId]/url` | Phase 19's, extended to `BuyerDocument` ids |

`shopHref.settings(tab?)`, `shopApi.documentsPresign()`, `shopApi.documentsComplete()`; `SHOP_PRIVATE_PATHS` gains `"/settings"`.

## 4. The screen

`requireClient()`; tab from `?tab=`, default `profile`, unknown → `profile`. `h1` **Settings**, caption `"{buyerName} · {name}"`, a tab strip (`Profile · Company · Documents`, the category-strip style: active `font-semibold border-b-2 border-focus`).

### 4.1 Profile

`max-w-[640px]` → `max-w-panel-lg` (32rem; canvas 640 — record). `ProfileCard` from `src/components/settings/ProfileCard.tsx` with `roleLabel="Customer"`; its `SessionProvider` requirement is met by wrapping the tab (as `/settings` on the portal does). Beneath it `SecurityCard` — the Password row and *Change password*, which opens the existing `ChangePasswordForm` dialog. The email row's caption reads "Your email is how we identify your account. Ask us to change it."

### 4.2 Company

`CompanyCard` (server): `loadReviewBuyer` from Phase 18 widened to `loadClientBuyer(buyerId)` → `{ name, address, contactName, email, phone, paymentTerms }` (narrow select, asserted). Rows *Registered name · Delivery address · Contact · Email · Phone · Payment terms*; a null value's row is omitted, as `BuyerDetailsCard` does in ops. **Ask us to change this** outlined → `mailto:${SUPPLIER_EMAIL}?subject=Change of details for ${name}`, omitted when unset; the paragraph "These are the details we invoice and deliver against, so they are changed by our team rather than edited here."

### 4.3 Documents

Two columns `lg:grid-cols-[420px_1fr]` → `lg:grid-cols-[var(--container-panel-md)_minmax(0,1fr)]` (28rem = 448; canvas 420 — record).

- **Left**: the dropzone (`ShopDropzone`, client) — `border-2 border-dashed border-hairline-strong rounded-lg bg-surface p-lg`, upload icon in `text-focus`, "Upload a document", "Drop a PDF or a photo here, or click to choose. PDF, PNG or JPG up to 20 MB."; a hidden `<input type="file" multiple accept={ACCEPT_ATTRIBUTE}>`; drop and paste as `Dropzone` handles them. Beneath: caption `"{n} documents"`, then the list — each row a selectable button: a 36px tile (`bg-ink` for a generated PO, `bg-ink-secondary` for an upload, `bg-brand-sky` for an image — three tokens, all in the palette) holding the extension in mono, the name, the meta `"84 KB · 10 Sep 2026 · Generated by Loving Hands"` / `"… · Uploaded by {name}"`; the selected row `bg-surface`; an upload row carries a 36px trash button; a generated row does not. Rows in flight show the progress bar geometry from `useUploadQueue` and their `rejectionReason` when refused.
- **Right**: the preview pane `rounded-lg border-hairline bg-surface-soft`: a white header with the name and meta, **Open full size** (generated PO only → `/purchase-orders/{webOrderId}` new tab) and **Download** (ink, `shopApi.documentUrl(id, { download, redirect })`); the body centres an `<img>` for an image (`max-h-[…]` → `max-h-preview` from the existing `--spacing-preview`) or `DocumentPreview` for a PDF, both through the shop URL route. Nothing selected: "Pick a document from the list."

Deleting asks — `Dialog`: "Delete {name}? This cannot be undone." — then `deleteBuyerDocument(id)`.

## 5. Queries, routes and actions

```ts
// src/lib/queries/buyer-documents.ts
export type BuyerDocumentRow = {
  id: string; kind: "upload" | "generated"; name: string; ext: string;
  mimeType: string; sizeBytes: number; createdAt: Date; byLabel: string;   // "Uploaded by Aisha Rahman" | "Generated by Loving Hands"
  documentId: string;            // what the URL route takes: the BuyerDocument id, or the Document id
  webOrderId: string | null;     // generated only, for Open full size
};
export async function listBuyerDocuments(buyerId: string): Promise<BuyerDocumentRow[]>;   // completed uploads ∪ web orders with a document, newest first
export async function createPendingBuyerDocuments(buyerId, uploadedById, files: { name; type; size }[]): Promise<{ id; key; name }[]>;
export async function completeBuyerDocument(buyerId, id): Promise<"ok" | "missing" | "mismatch">;   // headObject, compare size and type, set completedAt or delete row + object
export async function findBuyerDocument(buyerId, id): Promise<{ r2Key; mimeType; originalName } | null>;  // completed only
export async function deleteBuyerDocumentOrphans(): Promise<number>;   // completedAt null, createdAt < 1 h; same odds as maybeDeleteOrphans
```

Presign route: `requireClient()`; body through `presignRequestSchema`; per file `rejectionReason` → `errors`; `createPendingBuyerDocuments`; `presignPut(key, type, size)`; the `PresignResponse` shape from `/api/upload/presign`. Complete route: `requireClient()`; `{ documentId }`; `completeBuyerDocument` → 200 / 404 / 409. The Phase 19 URL route tries `findClientDocument` then `findBuyerDocument`.

```ts
// src/actions/buyer-documents.ts
export async function deleteBuyerDocument(id: string): Promise<ActionResult>;   // requireClient; deleteMany where { id, buyerId }; then deleteObject; revalidate settings
```

`useBuyerDocumentUpload(onDone)` in `src/hooks/useBuyerDocumentUpload.ts` — `useImageUploadQueue` with the routes and types swapped; three concurrent PUTs, progress, plain-language failures.

The account menu gains the *Your company* label with **Company details** (`?tab=company`), **Documents** (`?tab=documents`) and **Account settings** (`?tab=profile`).

---

## 6. Tasks

### Task 1: Profile actions for any account

**Files:** `src/actions/profile.ts`, `src/actions/profile.test.ts`, `src/app/api/avatars/route.ts`, `src/app/api/avatars/[userId]/route.ts`, `src/lib/auth-guards.test.ts`, `src/app/(storefront)/shop/layout.tsx` (avatar providers)

- [ ] Failing tests: `updateProfile` as a `CLIENT` session succeeds and updates that user's row only; `signOutEverywhere` as a `CLIENT` is refused; the avatar read route returns 401 for a client asking for another user's id and 200 for their own (test the extracted `canReadAvatar(session, userId)` helper).
- [ ] FAIL → implement §2 → PASS. Commit `feat(shop): a client may change their own name, picture and password`

### Task 2: Schema and the document queries

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260913100000_buyer_documents/migration.sql`, `src/lib/r2.ts`, `src/lib/queries/buyer-documents.ts`, `src/lib/queries/buyer-documents.test.ts`

- [ ] Failing tests: `createPendingBuyerDocuments` writes rows with `pending:` keys then updates each to `buyers/{buyerId}/{id}.{ext}` (lower-cased extension from `extensionFor`); `completeBuyerDocument` sets `completedAt` when `headObject` matches, deletes the row and the object on a mismatch, returns `"missing"` for another buyer's id; `listBuyerDocuments` merges uploads and generated POs newest first and never selects `notes`; `findBuyerDocument` ignores uncompleted rows; the orphan sweep's `where` asserted.
- [ ] Migration by hand; deploy; generate; status clean. Implement → PASS. Commit `feat(db): documents a buyer keeps against their company`

### Task 3: Routes and the delete action

**Files:** `src/app/api/shop/documents/presign/route.ts`, `complete/route.ts`, `src/app/api/shop/documents/[documentId]/url/route.ts` (extend), `src/actions/buyer-documents.ts`, `src/actions/buyer-documents.test.ts`, `src/lib/shop-routes.ts` (+test)

- [ ] Failing tests: `deleteBuyerDocument` deletes `where { id, buyerId }` and then the object; a zero-count delete returns "That document is gone" and deletes no object; a guest is refused. Route bodies: a PDF and a 25 MB file in one batch → one presigned file and one error carrying `TOO_LARGE`'s string.
- [ ] FAIL → implement §5 → PASS. Wire check: `POST /api/shop/documents/presign` without a session → 401; as a client with `{ files: [{ name: "a.pdf", type: "application/pdf", size: 100 }] }` → 200 and a URL on the R2 host. Commit `feat(shop): upload, read and delete a buyer's documents`

### Task 4: The screen

**Files:** `src/app/(storefront)/shop/settings/page.tsx`, `loading.tsx`, `src/components/shop/settings/SettingsTabs.tsx`, `CompanyCard.tsx`, `DocumentsPanel.tsx`, `ShopDropzone.tsx`, `DocumentRow.tsx`, `DocumentPreviewPane.tsx`, `src/hooks/useBuyerDocumentUpload.ts`, `src/lib/queries/shop-buyer.ts` (`loadClientBuyer`), `src/components/shop/ShopAccountMenu.tsx`

- [ ] Build §4. `loadClientBuyer`'s select asserted by equality in `shop-buyer.test.ts`.
- [ ] Browser as the test client: Profile — pick a generated avatar → the header picture and the menu identity change without a reload, and a second tab updates (the 2026-09-08 `BroadcastChannel` check); change the name → the caption updates; Change password works and the old one no longer signs in. Company — the rows match the buyer's row in ops; a null phone omits its row. Documents — drop a PDF, a JPG and a 25 MB file together: two rows upload with progress, the third shows the 20 MB reason by name; `SELECT count(*) FROM "BuyerDocument" WHERE "buyerId" = … AND "completedAt" IS NOT NULL` reads 2; the R2 bucket lists both keys; selecting the JPG shows the image, the PDF renders; Download answers 302 then a `content-disposition` with the original name; the generated PO from Phase 19 sits in the list with no trash and *Open full size* opens the viewer; Delete removes the row **and** the object (bucket listing before/after). Another buyer's document id on the URL route → 404. Zero overflow at 390 with the two columns stacked.
- [ ] Commit `feat(shop): settings — profile, company, documents`

### Task 5: Verification, cleanup, history

- [ ] Suite, types, lint, build; sweep the three tabs × {390, 768, 1440}.
- [ ] Remove test data: the uploads and their objects, the avatar object, the name reverted; counts and bucket listing before/after.
- [ ] `context/current-feature.md` entry, including that the Phase 15 guard decision was reversed here and why.

## 7. Acceptance criteria

1. A client changes their picture, name and password from the shop; the change reaches the header and other tabs without a reload; ops-only actions remain refused to them (spot-check `signOutEverywhere` and `updateProduct`).
2. The Company tab shows exactly the buyer's row, omits empty rows, and offers a message rather than an edit.
3. A mixed batch uploads the good files and refuses the bad ones by name with the Phase 03 strings; the rows and objects exist; abandoned uploads are swept.
4. Preview, download and delete work for uploads; generated purchase orders are listed, previewable, downloadable and not deletable.
5. Another buyer's document is a 404 on the wire; a guest is redirected by the proxy and refused by the routes.
6. Zero horizontal overflow at 390, 768 and 1440 on all three tabs.

## 8. Out of scope

- **Editing company details on the shop** — by design.
- **Ops seeing a buyer's uploads** — a `BuyerDocumentsCard` on `/buyers/[id]` is an obvious next step and is not drawn; one query away when asked.
- **Attaching an upload to a specific order** — the canvas keeps documents at the company level.
- **More than one buyer per contact** — unchanged from 15.
