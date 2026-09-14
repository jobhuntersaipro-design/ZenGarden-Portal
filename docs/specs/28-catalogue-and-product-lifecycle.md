# Phase 28 — The catalogue's vocabulary, and a product's life

**Goal:** A super admin can see, create, rename and remove the values that
brand, variant, market and category are chosen from, instead of only being
able to add one by typing it into a product and never being able to correct
it. A product can be published and unpublished in one visible move, and one
that nothing references can be deleted. The wordmark is the way home from
every room.

**Architecture:** One additive table, `CatalogLabel`, because these
vocabularies are **derived** today — `listLabels` runs a `distinct` over
`Product`, so a brand exists only while a product carries it. That is why
"create a value" has nowhere to live and "rename" has nothing to rename.
Products keep storing plain strings and take **no foreign key**: the table is
a registry of what may be typed, not the field itself, and a FK would drag
the purchase-order intake path, the catalogue importer and every seeded row
into this change for nothing.

Publishing needs no migration — `Product.active` already means exactly this
and the shop already reads it (`shop-catalogue.ts`); what changes is the
word, the visibility of the control, and the disappearance of "Archive".

**Branch:** `feature/catalogue-and-lifecycle`, from `main`. Depends on 08,
13, 25, 26, 27 (all on `main`).

**Design source:** the Claude Design canvas has no admin artboards. This
screen derives from the admin room's own conventions (Phases 25–26) and the
portal's, recorded as a deviation the way those phases did.

## Global constraints

- Super admin only, twice: `src/proxy.ts` already 404s the admin room for
  everyone else, and every action calls `requireSuperAdmin()`.
- Tokens only. No raw hex, px font size or arbitrary Tailwind value.
  Sentence-case labels. 44px touch targets below `sm`. No horizontal overflow
  at 390/768/1440.
- `{ success, data, error }` from every action. A write path has a test that
  fails before the code exists.
- Nothing shop-facing changes except what unpublishing already did;
  `shop-viewer.test.ts` passes untouched.

## 1. `CatalogLabel`

```prisma
enum CatalogLabelKind { BRAND VARIANT MARKET CATEGORY }

model CatalogLabel {
  id        String           @id @default(cuid())
  kind      CatalogLabelKind
  value     String
  createdAt DateTime         @default(now())

  @@unique([kind, value])
  @@index([kind])
}
```

One migration, `20260914120000_catalog_labels`, which also backfills: every
distinct non-null `brand`, `variant`, `market` and `category` on `Product`,
plus the nine seeded category names, so a fresh database and the development
one end up saying the same thing.

**The table and the products are kept in step from both ends.**
`createProduct` and `updateProduct` register any value they are given that is
not on record yet, inside their existing transaction — so "type to add" keeps
working and nothing a product carries can be missing from the picker.
`listAllLabels` reads `CatalogLabel` and nothing else; `categoryOptions`'
seeding job moves into the backfill, so the union disappears from the read
path.

## 2. `/admin/catalogue`

A third tab beside User management and Buyer management. Four sections, one
per kind, each listing every value with the number of products carrying it,
newest vocabulary last. Each row offers **Rename** and **Remove**; each
section offers **Add**.

- **Rename** updates the label and every product carrying it in one
  transaction, and reports the count: *"Renamed to Zen Garden — 161 products
  updated."* It is refused when the new value already exists for that kind
  (case-insensitively), because two rows would then mean one thing.
- **Remove** is refused while any product uses the value, naming the count
  and linking to the catalog filtered by it. An unused value is deleted
  outright.
- **`"Uncategorised"` can never be removed or renamed.** `resolveProducts`
  writes it verbatim when a document gives no category, so a catalogue
  without it would break the purchase-order intake path at the point where a
  person cannot see why.
- Each picker on the product form and in the edit drawer carries a **Manage**
  link to this screen, so it is reachable from where the values are used.

## 3. Published, not Active

| Was | Becomes |
| --- | --- |
| The `Active` switch, only in the edit drawer | A **Published / Unpublished** pill with its toggle on the product page |
| `archiveProduct` | `setProductPublished(productId, published)` |
| "Archive" / "Archived" | "Unpublish" / "Unpublished" |
| Catalog chip "Inactive" | Catalog chip "Unpublished" |

The database column stays `active`, and so does the `?filter=inactive` URL
key — a link somebody saved must keep working, and renaming a Postgres column
buys nothing a reader sees. Unpublishing needs no image; only *saving edits*
does (Phase 27).

## 4. Delete a product

A danger zone at the foot of the product page, shaped like Delete buyer.

- Refused while any purchase-order line or shop-order line references the
  product: the button is disabled and says which, e.g. *"14 purchase-order
  lines reference this product, so it can't be deleted — unpublish it
  instead."* The counts are already on the page, so the refusal is visible
  before it is attempted.
- Otherwise, typing the product's name exactly (trimmed, case-insensitive —
  the same rule on both sides) enables **Delete**, which removes the product,
  its price history and its images, deletes each image's R2 objects, and
  lands on `/products`.
- The name is re-checked and the references re-counted **inside the action**,
  not merely in the dialog: the dialog is presentation.

## 5. The wordmark is the way home

The admin room's header renders a bare `<Wordmark />`; so does the 404 page.
Both become links to `/`. The sign-in card's stays plain — from there, home
is where you already are.

## 6. Acceptance criteria

1. `/admin/catalogue` lists brands, variants, markets and categories with
   real product counts, and a Member gets the room's 404.
2. Adding a value makes it offered in the matching picker on the next product
   create, with no product carrying it yet.
3. Renaming a value in use rewrites every product carrying it, in one
   transaction, and the toast names the count.
4. Renaming onto an existing value of the same kind is refused.
5. Removing a value in use is refused with its count; removing an unused one
   deletes it.
6. `"Uncategorised"` cannot be renamed or removed.
7. Publish and unpublish from the product page change the pill, the catalog
   chip counts, and whether the shop lists the product.
8. Delete is refused, with a reason naming the references, on a product with
   order lines; a product with none is deleted along with its images and
   their R2 objects.
9. The wordmark links to `/` from the admin header and the 404 page.
10. No horizontal overflow at 390/768/1440 on `/admin/catalogue`, `/products`
    and a product page.
11. `vitest`, `tsc --noEmit`, `npm run lint` and `npm run build` clean.

## 7. Verification, 2026-09-14

Against the development database (`ep-mute-frog`), with the seeded member
promoted for the pass and reverted afterwards.

- **The migration's backfill is the real vocabulary, not an empty list.**
  `20260914120000_catalog_labels` applied with `migrate deploy` and produced
  **18 brands, 88 variants, 9 markets, 9 categories** — 124 rows. The screen's
  counts were checked against the database rather than against themselves:
  "Aara · 9 products" and "Buddha · 3 products" matched
  `product.count({ where: { brand } })` exactly.
- **Add, then use.** "Brunei" was added from the screen with no product
  carrying it ("No products"), and appeared in the Market picker on
  `/products/new` on the next load — a value that exists before any product,
  which is the thing the old derived list could not express.
- **Rename rewrote the products, read back from the rows.** "Buddha" →
  "Buddha Therapy" toasted *"Renamed to “Buddha Therapy” — 3 products
  updated."*, and the database then held `brand: "Buddha Therapy"` on all
  three SKUs, `Buddha` on none, and **one** label row. It was renamed back the
  same way at the end.
- **Refusals, each seen.** Renaming "Aara" onto **"darce"** — a different
  casing of an existing brand — was refused by the action with *"There is
  already a brand called “Darce”."* Remove on a value in use is disabled and
  titled "Products still use this value"; both controls on **"Uncategorised"**
  are disabled and titled "The purchase-order intake writes this value, so it
  stays". Removing the unused "Brunei" succeeded.
- **A member gets the room's 404, the new route included.** Signed in as a
  real `MEMBER` (a fresh sign-in, so the proxy's token carried the role rather
  than a stale one), `fetch` returned **404** for `/admin`, `/admin/buyers`
  **and** `/admin/catalogue`, each body carrying "Page not found" and none
  carrying any vocabulary.
- **Publish round-tripped on the shop's own wire.** A throwaway product was
  created, and `curl` on `shop.localhost` found it in the shop's search
  results (**1 hit**). Unpublished from the product page — pill "Published" →
  "Unpublished", toast "Product unpublished" — the same request returned
  **0 hits**; published again, **1 hit**.
- **Delete, refused and then done.** With one purchase-order line pointed at
  the product (created directly for the check and deleted straight after), the
  danger zone read *"1 purchase-order line references this product, so it
  can't be deleted. Unpublish it instead."* with the button disabled. With the
  reference gone, Delete stayed disabled for an empty box and for a partial
  name, and enabled for the name typed in the wrong case with surrounding
  spaces. After it: the product row `null`, its image and price rows gone by
  cascade, **both R2 objects answering `NotFound`** to `headObject`, and the
  catalogue back to 308.
- **The wordmark goes home.** Clicking it in the admin header landed on `/`;
  the 404 page's carries `href="/"`.
- **Sweep:** `/admin/catalogue`, `/products` and a product page carrying both
  new controls, at 390/768/1440 — nine combinations, `scrollWidth ===
  innerWidth` on every one. At 390 every Rename/Remove/Add control measured
  **44×44** and the Publish button 110×44; the sub-44px elements were the
  "N products" text links and the pre-existing "‹ Back to portal", the
  accepted plain-text-link class. The catalog's chip reads **Unpublished**
  while `/products?filter=inactive` still answers **200**, so a saved link
  keeps working.
- **Cleanup, counted.** Products **308**, `CatalogLabel` **124**, line items
  **1606**, purchase orders **400**, users **2**, `productImage` **0**,
  `productPrice` **0** — all back to the numbers this task started with.
  `aisha@lovinghandsportal.com` was read back as **MEMBER**. One label the
  task itself created — `MARKET "Malaysia"`, registered by the throwaway
  product because the create form defaults to it — was deleted by id after
  confirming no product used it; the next product created with that default
  will register it again, which is the registry working rather than a loss.
- 854/854 tests, `tsc --noEmit`, `npm run lint` (2 pre-existing warnings, 0
  errors) and `npm run build` all clean. Two pins were watched failing first:
  removing the `updateMany` from `renameLabel` broke the rewrite test, and
  disabling the reference check in `deleteProduct` broke the refusal test.

**Found while looking, not fixed:** the variant list shows genuine duplicates
in the customer's own data — "Aloe Vera" beside "Aloevera", "Anti Dandruff"
beside "Anti-Dandruff". Which spelling is right is the customer's call, not a
thing to infer, so nothing was merged. Note the shape of the work this screen
leaves them: **rename is refused onto an existing value**, so merging two
spellings means repointing each product from the one to the other and then
removing the emptied value. A one-move merge is the obvious next thing to
build here if they find they need it often.

**Not verified:** anything on production — this branch has never been
deployed, and the migration has not run there. The purchase-order intake path
that writes "Uncategorised" was not re-driven; the guard that protects it is
covered by tests and by the disabled controls above.

