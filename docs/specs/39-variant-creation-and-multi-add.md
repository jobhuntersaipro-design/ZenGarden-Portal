# Phase 39 — Creating a product's variants, and buying several at once

**Goal:** A super admin creates a product and all of its variants on one
screen, in one submit, bound to one family so the shop always draws them as
one card; a buyer orders several variants of that product from its page in a
single action. Asked for as: "when creating new product, Admin and superadmin
are able to create multiple variant for a product. when selecting a product,
buyers are allowed to buy product and select variant."

**Architecture:** No migration and no new dependency. A variant stays what it
has been since Phase 31 — a `Product` row of its own, with its own SKU, price
and images — and what binds a set of them is Phase 36's `ProductFamily`. This
phase adds a batch create path, an R2 object copy so one photo set can serve
every variant, and a quantity-per-variant buy box.

**Branch:** `feature/variant-creation`, stacked on
`feature/order-confirmation` rather than cut from `main`. Phases 36, 37 and 38
are committed there and unmerged, and all three carry migrations while
production's `DIRECT_URL` still points at the pooled Neon host — so merging
them to reach a clean base would deploy into the Phase 30 P1002 defect. This
phase carries no migration, so stacking costs nothing.

**Decisions taken with the user (2026-09-15):**

1. **One row per variant, not a new child table.** The alternative — `Product`
   as parent with a `ProductVariant` child holding SKU and price — would
   repoint `WebOrderLine`, `LineItem`, the extraction's product matching, the
   price trend, who-buys-it, bought-together, the catalogue importer and the
   family backfill, over 308 products, 400 purchase orders and 1606 line
   items. Rejected for the cost, not the shape.
2. **Buyer side: quantity per variant**, so 3 Papaya and 2 Lavender go in one
   action. The existing chip picker and card select stay.
3. **Per variant: label, SKU, price, optional images.** Everything else —
   brand, category, pack size, cartons per pallet, unit, market, description,
   family, active — is shared, entered once.
4. **One shared image set, per-variant images optional.** Every row still
   lands with at least one image, so Phase 27's rule holds.
5. **Still super-admin only.** Every product write is `requireSuperAdmin()`
   today and stays so; widening the catalogue to `MEMBER` is its own phase.

## 1. What is missing

The shop has grouped variants since Phase 31 and lets a buyer pick one: a
select or chip strip on each catalogue card (`ShopProductCard`) and a chip
picker on the product page (`VariantPicker`). Phase 36 made the grouping
explicit with `ProductFamily`.

Two things were never built.

**Creating them.** `/products/new` writes exactly one product. Eight flavours
of one shower cream means filling an eleven-field form eight times, retyping
the brand, category, pack size, market and description each time, and
remembering to pick the same family on every pass — because a hand-typed name
that differs by a word from its siblings' falls out of `groupKey`'s derived
match and draws its own lonely card.

**Buying them.** The buy box takes one carton count for the product on screen.
A buyer wanting three flavours navigates to three pages and adds three times.

## 2. Data: no migration, and a family at two

Each variant is a `Product` row. What the form adds is a guarantee: **with two
or more variant rows, a family is required.** The disclosure opens by itself,
its name prefilled from the product name, and submit is refused while the
family is neither picked nor described. One variant row keeps today's
behaviour exactly — a family is optional and its absence is an ordinary state.

Pack size and market are shared fields, which is what keeps
`variantsOfProduct`'s query (`familyId` + `packSize` + `market`) finding the
siblings it just created. Two variants that genuinely differ in pack size are
two families' worth of work and deliberately do **not** group onto one card —
`groupKey` has said so since Phase 31 and this phase does not change it.

## 3. The create screen

`/products/new` keeps its shape — the same two-column band, the same field
order, the same chrome as `/products/[id]` — and gains a section.

**Shared, above:** name, brand, category, pack size, cartons per pallet, unit,
market, description, family, active, and one image dropzone.

**Variants, below:** a row per variant, each carrying

- the **variant label** (Papaya, Lavender, Goat's Milk) — the growing list
  picker already used for `variant`;
- the **SKU**, proposed live by `generateVariantSku(familyCode, …)` from the
  family code, the label and the market, and editable per row as it is today
  (typing in it stops the proposal for that row alone);
- the **list price**, prefilled from the row above it, because a range is
  usually priced alike and the catalogue's own reality is identical prices
  across flavours;
- an optional **images** disclosure, collapsed, for a variant whose bottle
  does not look like the shared photo.

`+ Add variant` appends a row; each row past the first can be removed. One row
with a blank label is the single-product form that exists now. The ceiling is
24 rows — the largest real group is eight, and a form with 24 is already a
data-entry mistake worth stopping.

## 4. One action, one transaction

`createProductVariants(input)` joins `createProduct` in `src/actions/products.ts`,
guarded by the same `requireSuperAdmin()`.

`productVariantsSchema` (new, `src/lib/validation/product-variants.ts`) is the
shared half of `productSchema` plus `variants`: one to 24 entries of
`{ variant, sku, listPrice }`, each SKU through `skuSchema` and each price
through the same decimal rule. Two refinements:

- **a SKU repeated inside the batch is refused by name** — "Two variants carry
  the SKU ZEN-SC-2100-GM. Every variant needs its own." — rather than reaching
  Postgres and coming back as a P2002 that cannot say which pair collided;
- **two or more variants require a family**, matching §2.

The write is one `prisma.$transaction`: the inline family created once if
described, then, per variant, a `Product` row, its first `ProductPrice` (the
trend has no origin without it, as `createProduct` records), and
`registerLabels` for the labels the form grew. Eight variants either all exist
or none do — a partial catalogue is worse than a failed submit.

It returns `{ familyId, variants: [{ id, sku }] }` in row order, so the
browser can upload images against ids that now exist. Afterwards the form
lands on `/products?family={familyId}` — the family view narrowed to exactly
the rows just written, so the reader sees all eight rather than the first one
and wonders about the others. A single variant with no family lands on its own
product page, as it does today. That order is Phase 27's
and is not negotiable: presign hangs a `ProductImage` on a `productId`, so the
rows must be written first.

## 5. Images: uploaded once, copied to the siblings

A shared set uploaded to eight rows from the browser is eight times the bytes
— on a phone, with 5 MB a file, that is the difference between a submit and a
timeout.

So: the shared files upload **once**, to the first variant that staged none of
its own, through the existing `presign` → `PUT` → `complete` route, which is
what runs sharp and writes the thumbnail. Then
`copyImagesToVariants(sourceProductId, targetIds)` copies each object to the
sibling's own key with R2's `CopyObject` and writes its `ProductImage` row —
`copyObject` being a new helper in `src/lib/r2.ts` beside `putObject`. One
upload over the wire, one server-side copy per sibling per image, and every
row lands with a picture.

A variant that staged its own images gets those instead and is left out of the
copy. Where every variant staged its own, there is no shared set to copy and
none is asked for.

**The gate, stated once:** Create is disabled unless the shared dropzone holds
an image **or** every variant row holds one of its own — the two ways every
product can end up with a picture. It is the same rule Phase 27 set, counted
across rows instead of over one. A row that ends up with none — every copy failed — is the state Phase 27
already describes: the products exist, the form says so and links to them, and
`ProductImageManager` finishes the job. Nothing is rolled back, because a
browser closed mid-upload could not be either.

## 6. Buying several variants at once

On the shop product page, `BuyBox` renders exactly as it does today when the
group holds one variant. With more, it becomes a table:

- the headline price and per-piece caption stay the **viewed** variant's — this
  is still that product's page;
- one row per variant: label, its own price, a carton stepper starting at 0,
  and a line total. The viewed variant starts at 1, so the commonest action —
  add this one — is still one click;
- a footer reading total cartons across how many variants, the order total,
  and one **Add to cart**, disabled while every row is 0.

The chip picker above stays. It is navigation to a variant's own gallery,
description and specs, which the table does not replace.

Behind it, `addManyToCart({ lines })` in `src/actions/cart.ts`: the existing
`addToCartSchema` array-ified, every line checked with `orderableProduct`, and
each written through the same `upsertLine` inside one transaction, so a
variant already in the cart increments rather than duplicating. A guest goes
to `guestCart.addMany`, which folds the lines through `addLine` and respects
`MAX_GUEST_LINES` (100). Lines whose product has left the shop are **skipped
and counted**, never silently dropped — the wording `mergeGuestCart` already
uses.

The toast names both figures: "5 cartons across 2 variants added to your
order."

## 7. Acceptance criteria

1. `/products/new` creates one product with one variant row exactly as it does
   today: no family required, the same SKU proposal, the same toast, the same
   landing on the product's page.
2. Three variant rows submitted once against a **new** family produce
   **three** `Product` rows, three `ProductPrice` rows, one `ProductFamily`,
   and all three carry its `familyId` — read back from the database, not from
   the toast. Against an **existing** family, no family row is created and all
   three carry the one that was picked (`productFamily.count()` unchanged).
3. Those three draw **one** card in the shop, with a three-option picker, and
   the card count rises by exactly one.
4. A SKU typed twice across two rows refuses the submit, names the SKU, and
   writes **nothing** — `product.count()` unchanged.
5. A second variant row with no family chosen refuses the submit and says so.
6. A failing `ProductFamily` create (a duplicate code) leaves zero products
   behind: the transaction is all-or-nothing.
7. One shared image on a three-variant submit yields three `ProductImage` rows
   across the three products, each with its own `r2Key` and `thumbKey`, all
   three objects readable from R2, and exactly **one** browser upload observed
   on the wire.
8. A variant with its own staged image gets that image and not the shared one.
9. The shop product page of a single-variant product renders today's buy box
   unchanged: one stepper, one Add to cart, no table.
10. On a multi-variant page, setting 3 on one variant and 2 on another and
    pressing Add to cart produces **two** `WebOrderLine` rows with cartons 3
    and 2, one action, one round trip.
11. The same on the guest cart writes two lines to `localStorage` carrying
    product ids and cartons and **no price**.
12. Adding a variant already in the cart increments that line rather than
    duplicating it.
13. A MEMBER and a CLIENT both fail to reach `createProductVariants`; the
    error is the guard's own.
14. Create is disabled with no image anywhere, enabled by one shared image,
    and enabled by per-variant images alone with the shared dropzone empty.
15. No horizontal overflow at 390 / 768 / 1440 on `/products/new` with three
    variant rows staged, and on a multi-variant shop product page; every
    stepper and remove control at 390 is at least 44px.

## 8. Testing

**Unit.** `product-variants.test.ts`: the in-batch duplicate SKU refusal, the
family requirement at two rows and its absence at one, per-variant price
validation, the 24-row ceiling, and that a shared field is applied to every
variant. `cart.test.ts` gains `addManyToCart`: the line cap, an unorderable
line skipped and counted, an increment on a product already in the cart, and
an empty `lines` array refused. `guest-cart.test.ts` gains `addLines`,
including the `MAX_GUEST_LINES` cap. Each new test is watched failing before
it is trusted to pass.

**Browser, as a real super admin and a real buyer.** A three-variant product
created from `/products/new` with one shared image; its card and picker read
in the shop; two of its variants added in one action and the resulting
`WebOrderLine` rows read from the database; the refusals of criteria 4 and 5
driven rather than argued. Counts recorded before and after, and every row and
R2 object this pass creates deleted by id afterwards — products, prices,
images, the family, the web order and its lines — with the counts read back to
the baseline (308 products, 59 families, 400 purchase orders, 0 web orders).

## 9. Known, and out of scope

- **`ProductSheet` still edits one product.** Adding a variant to a product
  that already exists is the create screen's job for now: open it, pick the
  family, add the rows. A "+ Add variant" on `/products/[id]` is a fair
  follow-on and is not in this phase.
- **Prices are per variant and prefilled, not shared.** A single price field
  applying to all of them would be less typing and would quietly overwrite a
  flavour that really costs more.
- **`ShopVariant` gains `packSize` and `unit`** so the buy-box rows can print
  a per-piece figure. `VARIANT_SELECT` already selects the first; the second
  is one column.
- **Production's `DIRECT_URL` still points at the pooled Neon host** (carried
  since Phase 30). This phase carries no migration, so it does not deploy into
  that defect — but Phases 36, 37 and 38 do.
