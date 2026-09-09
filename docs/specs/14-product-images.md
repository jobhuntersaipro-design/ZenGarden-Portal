# Phase 14 — Product images

Branch `feature/product-images`. Depends on: 03 (presign / complete upload
pattern), 08 (products, `ProductImage`, the gallery), 10 (`sharp` in production).

Goal: a super admin can put pictures on a product — one at a time from the
product page, or three hundred at once from a folder — so the catalogue is
presentable before the storefront opens on it.

## 0. Why this exists

Phase 08 §1 specced this and it was never built. `ProductImage` exists,
`ProductGallery` and `ProductThumb` read it through presigned GETs, and
`reorderImages` and `deleteImage` are written and tested in
`src/actions/products.ts:179-238`. The gallery's empty state already promises
the feature that is missing — *"Add images · PNG, JPG or WebP up to 5 MB"*
(`ProductGallery.tsx:101-104`).

What is absent is the write path. `ProductImage` rows are created **nowhere in
application code** — only by `prisma/seed.ts`. There is no
`/api/products/[id]/images` route, so on production every one of the 309 real
products is a text card.

This phase is therefore mostly *building what 08 §1 already describes*, plus the
bulk path that 309 products makes unavoidable.

## 1. Data model

**No migration.** `ProductImage` (`prisma/schema.prisma:261-271`) already carries
everything: `r2Key @unique`, `thumbKey`, `position` with
`@@unique([productId, position])`, `sizeBytes`, and a cascade from `Product`.
The key shapes in its comments — `products/{productId}/{id}.{ext}` and
`products/{productId}/{id}.1600.webp` — are the contract this phase implements.

## 2. Keys — `src/lib/r2.ts`

Two helpers beside the existing `documentKey`:

```ts
/** `products/{productId}/{imageId}.jpg` — the original, exactly as uploaded. */
export function productImageKey(productId: string, imageId: string, ext: string): string;

/** `products/{productId}/{imageId}.1600.webp` — the derivative every screen reads. */
export function productThumbKey(productId: string, imageId: string): string;
```

The extension is lower-cased and its leading dot stripped, so `documentKey`'s
callers and these agree on shape. The original is kept rather than discarded:
re-deriving a larger rendition later must not mean asking for the photographs
again.

## 3. Validation — `src/lib/validation/product-images.ts`

Modelled on `src/lib/validation/upload.ts`, which already owns this vocabulary
for PO documents. Constants and one `rejectionReason(file)` returning a
user-facing string or `null`:

| Rule | Reason shown |
|---|---|
| `image/png`, `image/jpeg`, `image/webp` only | "That file type isn't supported — use PNG, JPG or WebP." |
| ≤ 5 MB (08 §1) | "That image is 6.2 MB. The limit is 5 MB." |
| ≤ 8 images per product | "This product already has 8 images." |
| Name ≤ 255 characters | "That file name is too long." |

Eight is a product page, not a gallery. It is a number this file owns, so
raising it is one edit and one test.

## 4. Routes

`src/app/api/products/[id]/images/presign/route.ts` and `…/complete/route.ts`,
both `requireSuperAdmin()`, both shaped like
`src/app/api/upload/{presign,complete}/route.ts` — same `{ files, errors }`
response so one rejected file does not sink the batch, same `pending:`
placeholder key so the row is created before the key that carries its id.

### Presign takes the whole batch in one call

This is not a stylistic echo of Phase 03. `ProductImage` has
`@@unique([productId, position])` and the upload hook runs three files at once,
so **presigning per file races on `position` and throws P2002**. Allocating
positions serially inside a single route call removes the race by construction
rather than by retry. `position` starts at the current count, so the first image
uploaded to an empty product is position 0 — the cover.

### Complete verifies before it trusts

`headObject(r2Key)` and compare `ContentLength` and `ContentType` against the
row before doing any work, exactly as `src/app/api/upload/complete/route.ts:68-86`
does and for the same reason: **a presigned URL proves what the client
*declared*, not what it sent.** On a mismatch, delete the object and the row and
return 400 — a half-made image is worse than none, because the gallery would
render a tile nobody can load.

## 5. Processing — `src/lib/product-image-store.ts`

A sibling of `src/lib/avatar-store.ts`, which is the module that already knows
how to be careful with `sharp` in this app.

```ts
sharp(Buffer.from(bytes))
  .rotate()                                              // EXIF orientation
  .resize({ width: 1600, fit: "inside", withoutEnlargement: true })
  .webp({ quality: 82 })
```

Three things it must keep from the avatar module:

- **`sharp(...)` inside a try/catch.** The declared Content-Type says what the
  client claimed; opening the file is where you find out what arrived. A file
  `sharp` cannot open is not an image whatever its header said
  (`avatar-store.ts:34-42`).
- **A `ProductImageError` whose message is written for the user** and shown
  verbatim, like `AvatarError` (`avatar-store.ts:16-21`).
- **`withoutEnlargement`**, so a 400px supplier thumbnail is stored at 400px
  rather than upscaled into blur.

`.rotate()` is the one addition, and it is not optional: a phone photograph
carries its orientation in EXIF, and `sharp` drops EXIF on write. Without it
every picture taken in portrait lands on its side. The avatar path never needed
it because a 256px square crop of a face is forgiving; a 1600px product shot is
not.

> ⚠️ **`next.config.ts` `SHARP_ROUTES` must gain the complete route.** That
> file's own 25-line comment records a production-only `ERR_DLOPEN_FAILED:
> libvips-cpp.so.8.18.6` from 2026-09-08: Vercel's build trace drops
> `@img/sharp-libvips*` on purpose, and **it cannot reproduce on macOS**, because
> a darwin build traces the darwin packages. Omitting the route reproduces that
> outage exactly. Check the emitted `.nft.json` before pushing, as that fix did.
> Add `maxDuration` for the route to `vercel.json` too — it fetches ≤ 5 MB and
> resizes once, so 30 s is ample.

## 6. UI — `src/components/products/ProductImageManager.tsx`

On `/products/[id]`, in the gallery column beside `ProductGallery`, rendered for
super admins only and reachable from the empty state that already advertises it.

- `ImageDropzone` — a slim sibling of `src/components/upload/Dropzone.tsx`:
  the same drop / browse / paste funnel and the same rear-camera `capture` input
  below `sm` that Phase 06's mobile pass added, with different copy and `accept`.
- A grid of current images, each with **Make cover**, **←**, **→** and
  **Remove**, all wired to the existing `reorderImages(productId, ids[])` and
  `deleteImage(imageId)`. Nothing new is written server-side for reordering.

**Arrow buttons rather than drag-and-drop.** `@dnd-kit` is named in the master
spec's dependency table and is **not in `package.json`**. Buttons need no new
dependency and are keyboard-accessible without a parallel drag alternative,
which a drag implementation would have to grow anyway. Record the deviation in
the PR.

Uploading uses a new `src/hooks/useImageUploadQueue.ts` rather than
`useUploadQueue`. That hook is PO-specific — it imports `retryExtraction` and
models `extracting` and `ready` states that mean nothing here — and Phase 04's
review of it concluded the status vocabulary should not be shared by anything
that does not share the journey.

`self-start` on the manager, for the reason recorded on 2026-09-09: a child of a
stretched grid row takes an aspect ratio's width from the row height, and the
details card beside it is eleven fields tall.

## 7. Bulk import — `scripts/import-product-images.ts`

309 products is not a clicking job. Following `scripts/import-catalog.ts`:

- Reads a folder whose files are named by SKU — `ZEN-SC-2100-GM-MY.jpg` is the
  cover, `ZEN-SC-2100-GM-MY-2.jpg` the second image.
- Resolves through `normaliseSku` (`src/lib/validation/products.ts:21`), so the
  slashes and spaces real codes carry resolve the same way the app resolves
  them.
- **Reports unmatched files rather than guessing.** Never fuzzy-matches a
  filename to a product: attaching a photograph to the wrong product is a
  mispriced order waiting to happen and nobody can see it happened.
- `--dry-run` prints the whole table before writing anything.

The dry run is not ceremony. The catalogue importer's dry run found six defects
before a single row was written, three of them silent, and that is the entire
reason this script copies its shape rather than inventing one.

## 8. Tests

| Case | Expectation |
|---|---|
| `rejectionReason` on a WebP, a PNG, a JPG | `null` |
| …on a PDF | the type message |
| …on 6 MB | the size message, naming 6 MB |
| …on the 9th image | the count message |
| `productImageKey("p1", "i1", ".JPG")` | `products/p1/i1.jpg` |
| `productThumbKey("p1", "i1")` | `products/p1/i1.1600.webp` |
| `reorderImages` | every row is shifted out of the way before any is rewritten — the `+1000` step is the whole point of that function |
| `deleteImage` when `deleteObject` throws | the row is still deleted, or the gallery shows a tile nobody can load or remove |
| Bulk import, unmatched filename | reported, not attached |
| Bulk import, `ZEN/SC/2100/CARROT.jpg` | resolves through `normaliseSku` |

## 9. Acceptance criteria

1. A super admin drops three images on a product and all three appear in the
   gallery, cover first, without a reload.
2. A photograph taken in portrait on a phone appears upright.
3. A PDF and a 6 MB file are refused by name with the reason on the row, and the
   other files in the same batch still upload.
4. Three files uploaded at once produce positions 0, 1, 2 — never a P2002.
5. **Verified on production**, not only locally: the sharp failure of 2026-09-08
   cannot reproduce on macOS.
6. Reordering and *Make cover* change what `ProductThumb` shows on `/products`.
7. Removing an image deletes both R2 objects; no orphan is left.
8. `scripts/import-product-images.ts --dry-run` prints the match table and
   writes nothing; the real run matches it.
9. No horizontal page overflow at 390px, 768px and 1440px.

## 10. Out of scope

- **Drag-to-reorder.** Needs a dependency that is not installed and a keyboard
  alternative that the buttons already are. Revisit if eight images ever becomes
  eighty.
- **Cropping or editing in the browser.** Deferred once already in Phase 08 and
  still not asked for.
- **A second rendition (thumbnail / 2×).** One 1600px WebP covers every current
  render; the original is kept, so another size is a re-derivation, not a
  re-upload.
- **Alt text per image.** Real accessibility work, and it needs a column. The
  gallery falls back to the product name meanwhile.
- **Public image URLs.** The bucket stays private and every render is a
  presigned GET, which is what Phase 16's storefront will use too.
