# Phase 27 — A product cannot exist without a picture

**Goal:** Creating a product asks for at least one photograph and will not
save without it, and a product that has none cannot be edited until it does.
Category stops being a list only a developer can extend: a super admin adds
one by typing it, the way brand, variant and market have worked since
Phase 13.

**Architecture:** No migration. `Product.category` is already a plain
`String` column, so making it grow is a validation change, a picker swap and
a fallback in the SKU generator. The image requirement reuses the whole
Phase 14 pipeline — `ImageDropzone`, presign → PUT → complete,
`useImageUploadQueue` — with one change: the queue takes the product id at
`add()` time rather than at hook time, because on the create page the id does
not exist until the moment the form is submitted.

**Branch:** `feature/product-images-required`, from `main`. Depends on 08,
12, 13, 14 (all on `main`).

**Design source:** the Claude Design canvas has no `/products/new` artboard —
recorded as a deviation on 2026-09-08 when that page was built. This phase
keeps deriving its layout from `/products/[id]`.

## Global constraints

- Super admin only, twice: the pages redirect, and every action and route
  calls `requireSuperAdmin()`.
- Tokens only. No raw hex, px font size or arbitrary Tailwind value.
  Sentence-case labels. 44px touch targets below `sm`. No horizontal overflow
  at 390/768/1440.
- `{ success, data, error }` from every action. A write path has a test that
  fails before the code exists.
- Nothing shop-facing changes; `shop-viewer.test.ts` passes untouched.

## 1. The create page requires an image

`/products/new` currently draws a dashed panel reading "Images are added once
storage is configured". That has been untrue since Phase 14. It becomes a
staging gallery.

- `ImageDropzone` (drop, browse) plus a tile per staged file, previewed from
  an object URL. The first tile is the **Cover**; arrows move a tile one
  place, a bin removes it — the same four controls, the same order and the
  same 44px sizing as `ProductImageManager`, because they do the same job.
- The staged files are validated by `rejectionReason` as they are chosen —
  PNG/JPG/WebP, 5 MB, `MAX_IMAGES_PER_PRODUCT` — and a rejected file is
  listed with its reason rather than silently dropped.
- **Create product** is disabled while no valid file is staged, with the
  caption "Add at least one image" under it.

**Order of operations, and why.** Presign writes `ProductImage` rows keyed to
a `productId`, so nothing can be uploaded before the product row exists. The
submit is therefore: `createProduct(…)` → upload the staged files against the
returned id → redirect to `/products/[id]`.

**When an upload fails after the row is written.** The product is *not*
deleted. The page stays where it is, the failed tiles carry their reason, and
a message names the product as created with a link to its page, where
`ProductImageManager` can finish the job. The product carries the existing
`missing-image` attention flag until it does. A rollback was considered and
declined: it cannot cover a browser closed mid-upload, so it would buy a
guarantee it does not actually provide.

## 2. An image-less product cannot be edited

- `updateProduct` counts the product's images first and refuses with
  **"Add at least one image before saving changes."** when there are none.
  This is the enforcement; the drawer's own disabled button is presentation.
- `ProductSheet` shows the same sentence above a disabled **Save changes**
  and points at the Images panel behind it. The drawer is only ever opened
  from `/products/[id]`, which already carries `ProductImageManager`, so the
  fix is on screen — the reader is never sent anywhere to satisfy it.
- **Archive is not gated.** Archiving an image-less product is exactly what a
  reader may want to do about it, and blocking that would leave the 308
  catalogue rows with no move at all.
- **The purchase-order intake path is not gated.** `createProductsForLines`
  creates a product from a printed code with no picture in sight; that is the
  whole point of `needsReview`, and gating it would block confirming an
  order. `createProduct` (the form's action) is likewise not gated
  server-side — it cannot be, since the row must exist before an image can
  reference it.

Known cost, stated: every one of the ~308 existing products has no image, so
each needs one before its next edit. That is the deliberate choice — the
`missing-image` chip on the catalog is the worklist for it.

## 3. Category grows by typing

| Was | Becomes |
| --- | --- |
| `z.enum(PRODUCT_CATEGORIES)` | trimmed string, 1–56 chars |
| `<select>` on `/products/new` and in `ProductSheet` | `GrowingListPicker` |
| Filter `<select>` listing the fixed nine | the union of the seed nine and every category in use |
| `PRODUCT_CATEGORIES` as *the* catalogue | `PRODUCT_CATEGORIES` as the **seed** list |

- `listLabels` gains `"category"`, so the picker offers the values already on
  products; the seed nine are unioned in, so a fresh database still offers
  them and "Uncategorised" never disappears.
- `generateSku` looked up `TYPES[category]` by exact key and would produce
  `undefined` for a new one. It now falls back to the initials rule
  `skuCode` already applies to brands and markets: "Pet care" → `PC`,
  "Bleach" → `BLEACH`.
- `categorise()` in the catalog importer still returns one of the seed nine;
  its return type widens to `string` and nothing else about the import
  changes.

**The risk, recorded rather than waved through.** Categories are what every
share chart groups by, and that is why the list was hardcoded (see the
comment in `product-categories.ts`). A synonym — "Hair care" beside
"Haircare" — now splits a slice, and no code can tell that it is wrong.
Casing alone cannot fork the list, because `Combobox` matches
case-insensitively and offers no "+ Add" row for a value that already exists.
This is an accepted trade: the cost of nobody being able to record a new kind
of product without a deploy was judged higher.

## 4. What the browser found that the build could not

Two defects, both fixed in this phase rather than recorded for later.

**`listLabels("category")` made the create page fail to render.** The query
reads `where: { [field]: { not: null } }`, which is right for the three
nullable labels and is a **runtime** error against `category`, a non-nullable
column: *"Argument `not` must not be null."* The computed key widens the
object enough that `tsc` sees nothing, so `npm run build` passed and
`/products/new` answered a server error instead of a page. The query now
omits the clause for `category`.

**The category picker offered "No category".** `GrowingListPicker` always
renders a `No {label}` row, which is right for brand, variant and market and
wrong for the one label a product must have: choosing it did nothing at all,
because the form keeps the previous value rather than sending a blank the
schema would refuse. The picker takes a `required` flag now — no "none" row,
and the empty-state placeholder reads "Choose a category".

## 5. Acceptance criteria

1. `/products/new` cannot be submitted with no image: the button is disabled
   and says why. With one image staged it creates the product, uploads the
   file and lands on the detail page with the picture in the gallery.
2. A second staged image lands at position 1, and the tile marked **Cover**
   before submitting is the cover afterwards.
3. A file the rules refuse (a PDF, a 17 MB photograph) is listed with its
   reason and does not block the good files beside it.
4. Saving `ProductSheet` on a product with no images fails with "Add at least
   one image before saving changes." — proven by calling the action, not only
   by the disabled button. Archiving the same product still works.
5. A category typed on the create form is stored, appears in the catalog's
   category filter, and is offered in the picker on the next create.
6. The SKU suggestion fills in for a category that is not one of the seed
   nine.
7. No horizontal overflow at 390/768/1440 on `/products/new`, `/products` and
   a product detail page.
8. `vitest`, `tsc --noEmit`, `npm run lint` and `npm run build` clean.

## 6. Verification, 2026-09-14

Run against the development database (`ep-mute-frog`) with the seeded member
promoted to super admin for the pass and reverted afterwards.

- **A product created with two real images, end to end.** Four files chosen
  in one batch: `shot-one.jpg` and `shot-two.png` staged, `not-an-image.pdf`
  refused as *"That file type isn't supported — use PNG, JPG or WebP"* and a
  6.0 MB file as *"That image is 6.0 MB — the limit is 5.0 MB"*, with the
  button turning from "Add at least one image" to "2 images ready". After
  Create: two `ProductImage` rows at positions **0** and **1**, the cover the
  jpg that was the first tile, both carrying a `thumbKey`, and the detail
  page's `<img>` elements decoding at **900×700** and **700×700** from R2 —
  read from `naturalWidth`, not from the tile looking right.
- **A category typed into the picker.** "Pet care" produced the SKU
  **`PC-0500-MY`** (the initials fallback, with the size read out of the
  name), saved, then appeared in the catalog's category filter — filtering to
  it returned *"1 product"* — and in the picker on the next create, after the
  seeded nine.
- **The edit gate, proven on the wire.** On an imported product with no
  images the drawer showed the sentence and a disabled **Save changes**.
  Forcing the button enabled from the console was not enough (React does not
  dispatch a click for a disabled control), so the drawer's own guard was
  removed for one run: the action was reached — the dev log shows
  `updateProduct(…)` — and answered with the toast **"Add at least one image
  before saving changes."** The row's `updatedAt` was **unchanged** across
  three attempts. Archive stayed enabled throughout. The guard was restored.
- **The refusal has a test that fails without the code.** Deleting the
  `_count.images === 0` branch turned the new test red (*expected
  { success: true } to deeply equal { success: false }*); restoring it turned
  it green.
- **The failure path was driven, not argued.** With the presign route forced
  to 500, Create wrote the product and the page stayed put: toast *"Product
  created, but its images didn't upload"*, the tile carrying *"We couldn't
  reach the server"*, and the header offering **Open the product** with
  "Finish adding its images there". That product then appeared under the
  catalog's **Missing image** chip.
- **Sweep:** `/products/new` (with two tiles staged and a rejected row),
  `/products` and a product detail page at 390/768/1440 — nine combinations,
  `scrollWidth === innerWidth` on every one. At 390 the only sub-44px
  controls were the accepted classes: the `SkipLink`, the `sr-only` file
  input, and the shadcn `Switch` at 32×18 (recorded 2026-09-11). Console:
  0 errors, 0 warnings on a fresh load.
- **Cleanup, counted before and after.** Both test products deleted by id
  along with their four R2 objects — each key re-checked with `headObject`
  and answering **NotFound**. `product.count()` **308**,
  `productImage.count()` **0**, `productPrice.count()` **0**,
  `user.count()` **2**, the category list back to the eight in use, and
  `aisha@lovinghandsportal.com` read back as **MEMBER**.
- 833/833 tests, `tsc --noEmit`, `npm run lint` (2 pre-existing warnings in
  files this phase never touched, 0 errors) and `npm run build` all clean.

**Not verified:** anything on production — this branch has never been
deployed and no production database was read or written. The purchase-order
intake path that creates products without images was not re-driven; it is
untouched by this phase's files, and `createProduct`'s own action carries no
new gate.
