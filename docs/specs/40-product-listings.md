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
  carries a family → **that family**; if the members carry **more than
  one** family — possible after curation — the resolver returns them all,
  the form says *"matches 2 families: pick one"*, and the write refuses
  rather than guess;
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

**In the writes.** `createProductVariants` and `updateProduct` — the two
writers `/products/new` and the edit drawer actually call — run the same
resolver inside their transaction when the
input carries neither `familyId` nor `newFamily`: an existing family is
assigned; a derived group with members gets a family created — code from
`generateFamilyCode` over brand, category and the size in the name — and
**every member of the group is assigned to it** along with the new or
edited row; an empty group gets no family, as today. A family-code
collision on that create is refused with the named message Phase 39 added.
The form's line names the listing, not its code — `ListingNotice` prints a
family's *name*, which is what a reader recognises; the code a derived group
would take is `generateFamilyCode`'s to decide at write time, and printing a
prediction of it would be a second place for the two to disagree.

## 5. The admin listing page

**`/admin/catalogue/families/[id]`**, reached from the families table
(whose rows link there instead of to the ops product list) and from the
forms' "joins the existing listing" link. Super admin only, behind the
existing `(admin)` guard.

- The family's code, name, brand, size — **read-only here**, as a masthead.
  They are edited in `/admin/catalogue`'s families section, through
  `updateFamily`, so a rename still happens in exactly one place; this page
  is about membership.
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

## 8. Acceptance criteria — as measured

Driven in a browser on the development database on 2026-09-16 as a real super
admin and a real MEMBER, with every write read back from the database. Report:
`.superpowers/sdd/2026-09-16-product-listings/task-8-report.md`.

Baseline before and after, identical: products **308**, families **59**,
product images **0**, product prices **0**, web orders **0**, purchase orders
**400**, users **2**, catalogue labels **124**, products with no family **0**,
inactive products **0**.

**Nine passed outright, one passed in part, two passed with a note. None
failed.**

**1117/1117 tests, `tsc --noEmit`, `npm run lint`** (the same 2 pre-existing
warnings, 0 errors) **and `npm run build` all clean**, after the final review's
fix wave.

1. **Pass.** Family `MRK-DW-1500` (Lemon and Lime, each at 12 and at 6 per
   carton, no market) drew **one** card — header "1 product" — with four picker
   labels each carrying its pack: *Lemon · 12 per carton*, *Lemon · 6 per
   carton*, *Lime · 12 per carton*, *Lime · 6 per carton*, and no pack in the
   card's caption. With the two 6-carton rows moved to market *Vietnam*, the
   same search drew **two** cards ("2 products · showing 1–2"), captioned *6
   per carton · Vietnam* and *12 per carton*, each labelling its variants
   *Lemon* / *Lime* with the pack dropped, since neither card mixes packs any
   more. Both rows were restored.
2. **Pass.** `ZEN-HW-0500-PROMO` — 8 products across Arab and India, whose own
   names read `PROMO H/WASH 500ML — …` — drew **two** cards, both titled by the
   family, *Zen Garden Promo Hand Wash 500ML*: Arab with its 6 variants, India
   with its 2. No variant on the wrong card.
3. **Pass.** On the create form, brand *Zen Garden* · name `PROMO H/WASH 500ML`
   · market *Arab* printed "Joins the existing listing **Zen Garden Promo Hand
   Wash 500ML** (6 variants)", linked to that family's page — 6 being the Arab
   count, not the family's 8. The submitted row read back with that family's id
   and `productFamily.count()` stayed 59.
4. **Pass, and the write really does reach rows nobody opened.** With the two
   India members detached (`productsWithNoFamily` 0 → 2), the form printed
   "Joins **PROMO H/WASH 500ML** — 2 products in no family yet. Saving puts all
   of them in one family." Submitting moved `productFamily.count()` **59 → 60**
   — one family, code `ZEN-SC-0500`, named by the derived title — and **all
   three** rows read back carrying it: the new row and both older ones, whose
   `createdAt` is six days earlier. `productsWithNoFamily` back to 0.
5. **Pass.** Brand *Zen Garden* · a name held by nothing · market *Vietnam*
   printed "This will be a new listing."; the row was written with no family,
   `productFamily.count()` unchanged, catalogue labels unchanged at 124.
6. **Pass.** The drawer's line moved with the fields on one uninterrupted
   screen — "new listing" at market Vietnam, then "Joins the existing listing
   **Zen Garden Promo Hand Wash 500ML** (7 variants)" at market Arab — and
   saving wrote exactly that family id onto a row that had none.
7. **Pass, all four controls read back.** The page rendered a section per
   market with flavour, SKU, pack and price per row. Hide set `active` false and
   the shop card went from four labels to three without losing the row; Show set
   it true again; Remove set `familyId` null and the shop then drew that row as
   its own derived card (one card became two); Add set `familyId` back. Product
   count was 311 before and after — nothing on the page deletes.
8. **Pass on the page; the actions' own refusal not driven.** Demoted, signed
   out and signed in again so the token carried MEMBER, `curl` on that session
   read **404** for `/admin`, `/admin/catalogue` and the listing page, with zero
   occurrences of the listing's content in any body. A crafted Server-Action
   POST was **not** a valid probe — it answered "Server action not found" for a
   super admin too — so the actions' `requireSuperAdmin` refusal stands on its
   unit tests plus the fact that the route registering them is unreachable.
9. **Pass, both directions, with the codes.** A product whose SKU equalled its
   generated code showed "Follows the family, variant and market" and no
   Regenerate; changing its variant moved the field live
   `ZEN-SC-0750-GMAP-VN` → `ZEN-SC-0750-FL-VN`, and the save wrote it. A
   product whose SKU did not — `ZEN-SC-0500-GMAP-AE` in family
   `ZEN-HW-0500-PROMO` — read "Not a generated code, so it stays as it is."
   beside **Regenerate → `ZEN-HW-0500-PROMO-GMAP-AE`**; changing its variant
   left the field untouched and moved only the proposal, to
   `ZEN-HW-0500-PROMO-FL-AE`. Pressing Regenerate filled the field and the save
   wrote that code.
10. **Pass.** With a throwaway product holding `ZEN-HW-0500-PROMO-FL-AE`,
    Regenerate then Save toasted exactly "That SKU is already in use.", the
    drawer stayed open, and the row read back unchanged on **both** fields — the
    variant edit did not slip through either.
11. **Pass.** Card picker, product-page chips and product-page quantity rows all
    printed the same four strings for the mixed-pack listing, character for
    character.
12. **Pass, with one new sub-44px element recorded.** All nine combinations
    measured `scrollWidth === innerWidth`: the listing page, the create form
    with its listing line, and the mixed-pack shop card at 390 / 768 / 1440.
    At 390 the listing page's six sub-44px elements are all plain-text links
    (Hide / Show / Remove / Add all clear 44px), and the shop card's 22 are the
    already-accepted classes (the variant radios are not among them). The create
    form adds one that is genuinely new: the listing line's family link, 281×33
    — a text link in a caption, the same shape as the "Manage values" links
    beside it, but new and therefore recorded rather than adopted. Console: 0
    errors on a fresh load of all four pages driven.

Found in passing, outside this phase's files and unfixed here:

- **The admin room's own families section has no Markets column.** Spec §5's
  "families table" was built as the `/products` family view, correctly; the
  admin section carries no market count of its own. Its rows do reach the
  listing page (commit `b41cf9e`), so it is no longer true that a super admin
  standing in the admin room can reach one only through a form's line.
- **The listing page shows the family's code, name, brand and size read-only**;
  editing them is still the admin catalogue's job. §5 now says so rather than
  describing them as editable here.
- **Presigned product-image uploads answer 403 in development.** Three of three
  browser PUTs to R2 failed; the form toasted "Product created, but the images
  didn't upload" and every key answered NotFound afterwards, so no orphan was
  left — but a product row and its image row are still written. The upload path
  is untouched by this phase.

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
- **A renamed family code makes its generated SKUs look hand-typed.** The
  equality test in §6 recomputes from the family's *current* code, so a
  product coded under `ZEN-SC-2100` whose family is later recoded to
  `ZEN-SC-2100-SCRUB` fails the test and gets the Regenerate button rather
  than an automatic rewrite. That is the safe side of the rule and is
  left as it is.
- **`createProduct` has had no caller since Phase 39** (`/products/new`
  goes through `createProductVariants`, which with one row does the same
  work). It is not taught the resolver; deleting it is a decision recorded
  against Phase 39 and still the user's.
- **`updateProduct` writing a new SKU** changes what extraction matches
  for that product from the next upload on. That is the point for a
  generated code; for a customer code the equality rule prevents it, and
  the Regenerate button's caption says so.
