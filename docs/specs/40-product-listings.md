# Phase 40 — Product listings: one product, its variants, and the admin who decides

**Goal:** On the shop, a product sold in several flavours or carton sizes to
one market is **one listing** the buyer opens and chooses a variant from. A
super admin sees which listing a new or edited product will join, and can
open any listing to see, add, remove, show or hide its variants. A product's
code follows its edits when the code was generated, and is never rewritten
when it was not. Asked for as: "there's 2 same product … I want to put it
under the same product, so when buyer click in they can choose the variant";
"let superadmin list product and choose what variant they want to list under
same product"; "group them automatically if it's the same listing, and let
admin know the current listing existed and will be added a new variant";
"the product code should be auto regenerated when the product is edited".

**Architecture:** No migration and no new dependency. A variant stays a
`Product` row; a listing is a `ProductFamily` **per market**, and where no
family exists yet, the group the shop already derives from brand + name +
market. Three changes to what exists — the grouping key, the variant labels,
and the edit drawer's SKU field — plus one new admin page, one listing
resolver used by both the forms and the writes, and two small server actions.

**Branch:** `feature/product-listings`, stacked on `feature/variant-creation`
(Phase 39), itself stacked on the unmerged Phases 36–38. Phase 39's
browser-pass data is still in the development database and its role
promotion still stands at the time of writing; that cleanup precedes this
branch.

**Decisions taken with the user (2026-09-16):**

1. **A listing is a product × market.** The same cream in Malaysia and in
   Indonesia is two listings, because they serve two markets. The same cream
   in Malaysia in Carrot and in Papaya is one listing with two variants.
2. **Pack size is a variant, not a listing.** Carrot at 6 per carton and at
   12 per carton sit under one listing; the buyer picks.
3. **The admin decides, explicitly** — a listing is a family; a family is
   curated on its own page. A row nobody has placed keeps grouping by
   brand + name + market, as today, so nothing explodes into one card per
   row the day this ships; a family, where one exists, wins.
4. **Joining is automatic and announced.** A product created or edited to
   match an existing listing joins it, and the form says so before submit.
5. **Codes regenerate automatically only when the generator made them.** A
   customer's printed code, or one typed by hand, never moves on its own.
6. **Production's listings come from the Phase 36 backfill**, run there once
   this deploys, with the exceptions fixed in the new admin page.
7. The screenshot that started this — Goat's Milk · Indonesia beside Carrot ·
   Malaysia — showed two correctly separate listings; the market on one was
   a slip while testing. Corrected to the same market, the shop already
   draws them as one card. What was missing is everything above.

## 1. What is missing

The shop has grouped a product's flavours since Phase 31, keyed on family
(or brand + name) **plus pack size plus market**. Two of those three were
right and one was a guess: pack size splits what the buyer thinks of as one
product. Phase 36 added `ProductFamily` as the explicit binding, assignable
one product at a time from the create form and the edit drawer, and
renamable in `/admin/catalogue` — but there is no screen that shows a
listing as a whole, no way to add or remove a product from a family except
by opening that product, and no word on either form that the product being
entered matches a listing that already exists. Production has no families
at all, so every card there is a coincidence of names.

And the edit drawer's SKU is a text box: change Goat's Milk to Papaya and the
code keeps saying `-GM-`.

## 2. The key: family or brand + name, then market

`groupKey` in `src/lib/product-groups.ts` becomes **identity + market**,
where identity is the family id or, failing one, brand + `groupName(name)`.
Pack size leaves the key. `variantsOfProduct` in
`src/lib/queries/shop-catalogue.ts` drops `packSize` from its `where` for
the same reason. Six modules read the key; the two suites that pin "two
pack sizes stay apart" are rewritten to pin "two pack sizes are one
listing", and "two markets stay apart" stays as it is.

`ShopProductGroup.packSize` becomes the pack **when every variant shares
one, else null**; the card caption prints the pack only then. The
catalogue's *Pack size* facet keeps a card when any of its variants
matches, and counts cards, as every facet does.

## 3. Variant labels carry only what differs

`variantLabels` in `product-groups.ts` labels a variant with its flavour, as
now, and appends the pack — `Papaya · 12 per carton` — **only when the
group holds more than one pack size**. The SKU is still appended where two
labels would otherwise collide, which is the existing rule for the
importer's duplicate rows. The same labels serve the card's picker, the
product page's chips and its quantity rows, so a variant is called one
thing everywhere.

## 4. The listing resolver, and the form that tells the admin

One pure function, `resolveListing`, answers "which listing does a product
with this brand, name and market belong to?" over a list of candidate rows:

- if any candidate in the derived group (same brand + `groupName` + market)
  carries a family → **that family**;
- else if the group has members → **the derived group**, named by its
  title and its member count, and flagged as *not yet a family*;
- else → **a new listing**.

It is used twice, so the message and the write cannot disagree:

**On the forms.** `/products/new` and the edit drawer call a read
(`findListing`) that runs the resolver over the products matching the
brand, name and market on screen, and print one of:

> *Joins the existing listing **Zen Garden Shower Cream 2.1L · Indonesia**
> (1 variant: Goat's Milk) →* — linked to the listing's admin page
>
> *Joins **Zen Garden Shower Cream 2.1L · Indonesia** (2 products in no
> family yet). Saving puts all of them in one family.*
>
> *This will be a new listing.*

The line updates as brand, name or market change, debounced like the
review screen's draft save. Choosing a family in the picker overrides it
and the line says which family will be used instead.

**In the writes.** `createProduct`, `createProductVariants` and
`updateProduct` run the same resolver inside their transaction when the
input carries neither `familyId` nor `newFamily`: an existing family is
assigned; a derived group with members gets a family created — code from
`generateFamilyCode` over brand, category and the size in the name — and
**every member of the group is assigned to it** along with the new or
edited row; an empty group gets no family, as today. A family-code
collision on that create is refused with the named message Phase 39 added,
and the form's line already showed the code it would take.

## 5. The admin listing page

**`/admin/catalogue/families/[id]`**, reached from the families table
(whose rows link there instead of to the ops product list) and from the
forms' "joins the existing listing" link. Super admin only, behind the
existing `(admin)` guard.

- The family's code, name, brand, size — editable, through `updateFamily`
  as today.
- **One section per market**, each being exactly what the shop draws as
  one card, headed *Zen Garden Shower Cream 2.1L · Indonesia*, with a row
  per variant: flavour · SKU · pack · price · **shown** or **hidden**.
- Per row: **Hide from shop** / **Show** — the existing `setProductPublished`,
  so hidden means the `active` flag ops already uses — and **Remove from
  family**, which sets `familyId` to null and returns the row to derived
  grouping. Nothing on this page deletes a product.
- **Add a product** — a `Combobox` over products not in this family,
  searched by SKU or name, showing brand · variant · market; choosing one
  sets its `familyId`.

Two server actions in `src/actions/product-families.ts`, beside
`updateFamily` and `removeFamily`: `addProductToFamily(productId, familyId)`
and `removeProductFromFamily(productId)`. Both `requireSuperAdmin()`, both
returning `{ success, data, error }`.

The families table gains a **Markets** column (already computed by
`groupFamilies`) so a family spanning three markets reads as three listings
at a glance.

## 6. The code follows the product

The edit drawer's SKU field takes the create form's behaviour: it shows the
generated code for the current brand · family · variant · market and stops
following the moment the reader types in it.

**Whether it follows at all is decided when the drawer opens.** The drawer
computes what the code *would have been* from the values the product
opened with — `generateVariantSku(familyCode, …)` where the product has a
family, `generateSku(…)` where it has none — and compares it to the stored
SKU:

- **equal** → the code was generated; the field follows edits and the
  save writes the new code;
- **different** → the code is the customer's or hand-typed; the field
  holds still, and beside it a one-click **Regenerate → `ZS-SC-2100-PP-ID`**
  shows the code it would take. Nothing changes unless that is pressed.

A regenerated code that collides with another product's is refused by the
server's existing "That SKU is already in use." — no pre-submit query, so
the drawer cannot promise a code is free; it can only propose one.

**`normaliseSku` still applies on save**, so a regenerated code enters the
catalogue one way, and extraction keeps matching printed codes exactly:
the eight production products carrying the customer's own codes fail the
equality test above and are never rewritten by an edit.

## 7. Production

No migration here, but production has **zero families**, so on the day
this deploys every card is still derived — with pack size gone from the
key, that alone merges the 6- and 12-carton rows of a line. Curated
listings arrive by running Phase 36's backfill there:

1. `npx tsx --env-file=<production> scripts/backfill-product-families.ts --propose out.json`
2. a person resolves every printed collision in `out.json`
3. `--apply out.json --dry-run`, read the counts, then `--apply out.json`
4. fix the exceptions the sheet got wrong in the new admin page

That is an operations step with its own checklist, not a code task, and it
stands behind two others: Phases 36–39 must deploy first, and production's
`DIRECT_URL` still points at the pooled Neon host.

## 8. Acceptance criteria

1. Two active products with the same brand, name and market and **different
   pack sizes** draw **one** card on the shop, with two picker labels
   carrying their packs; the same two in different markets draw two cards.
2. A family's products in two markets draw two cards, each titled by the
   family, each holding only that market's variants.
3. On `/products/new`, typing the brand, name and market of an existing
   listing shows the "joins the existing listing" line naming it and its
   variant count; submitting puts the new row in that family — read back.
4. The same against a derived group with no family shows the "no family
   yet" line; submitting creates **one** family and assigns **every** member
   of the group plus the new row — `productFamily.count()` rises by one,
   every member's `familyId` equal.
5. The same with nothing matching shows "new listing" and creates no family.
6. The edit drawer shows the same line, updating as brand, name or market
   change; saving joins as in 3–5.
7. `/admin/catalogue/families/[id]` renders a section per market with the
   right rows; Hide removes a variant from the shop card without deleting
   it; Show restores it; Remove from family returns the row to derived
   grouping; Add a product sets `familyId` — each read back.
8. A MEMBER gets the admin room's 404 on the listing page and its actions
   refuse them.
9. Editing the variant of a product whose SKU equals its generated code
   rewrites the SKU on save; editing one whose SKU does not equal it leaves
   the SKU unchanged and offers Regenerate; pressing Regenerate then saves
   the generated code.
10. A regenerated code that collides is refused with the named message and
    nothing is written.
11. The product page's chips and quantity rows and the card's picker all
    print the same label for the same variant.
12. No horizontal overflow at 390 / 768 / 1440 on the listing page and on a
    card with mixed pack sizes; every control ≥44px at 390.

## 9. Testing

**Unit.** `groupKey` and `variantLabels` (the rewritten pins, plus mixed
packs and the SKU-on-collision rule); `resolveListing` over the three
outcomes; the two family actions; the SKU-equality rule as a pure function
(`isGeneratedSku(product)`) covering a family product, a family-less
product, a customer code and a hand-typed one; `updateProduct` and the
create actions assigning a family through the resolver, and the
create-and-assign-members path.

**Browser.** Criteria 1–12 driven on the development database as a real
super admin, a real member and a real buyer, counts read before and after,
everything this pass creates deleted by id — the standing rule.

## 10. Known, and out of scope

- **No artboard exists for the listing page or the forms' listing line.**
  Derived from the admin buyer page and the create form; the canvas is
  behind the code until someone draws it. A recorded deviation.
- **The forms' line is a read, the write is the authority.** Between the
  read and the save another admin may have created the family the line
  said did not exist; the write's resolver then finds it and joins it, and
  the toast names what happened. The line is never allowed to *promise*.
- **Not in v1:** ordering variants within a listing; a per-listing cover
  image (the card shows the selected variant's); quantity-per-variant on
  the catalogue card; merging two families; renaming a listing's market.
- **`updateProduct` writing a new SKU** changes what extraction matches
  for that product from the next upload on. That is the point for a
  generated code; for a customer code the equality rule prevents it, and
  the Regenerate button's caption says so.
