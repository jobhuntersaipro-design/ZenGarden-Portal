# Phase 36 — Product families

**Goal:** A product code with two levels — a family (the product, across every
market) and a variant (the SKU) — so the catalogue can be listed and analysed
by product while every fragrance keeps its own row. Asked for as: "when listing
a product, there will be multiple variants of a product. Design a human
readable product code for future analysis … the smallest granularity should be
until variant level, but later on I should be able to analyse by product
level" and "revamp the product listing from admin or superadmin".

**Architecture:** One additive migration, `20260916090000_product_families`: a
`ProductFamily` table and a nullable `Product.familyId`. No new dependency.
Existing SKUs are never rewritten. Families are assigned to the 308 existing
products by a two-step script whose first step reports collisions to a person
rather than resolving them by guess.

**Branch:** `feature/product-families`, from `main`.

**Decisions taken with the user (2026-09-15):** a family spans markets — market
is a dimension of a variant, not part of the product; existing SKUs stay as
they are and get a family backfilled; only new products take the new proposal.

## 1. What a family is, and why it is a table

A family is a product line at one size, across every market: *Zen Garden
Shower Cream 2.1L*. Its variants are the products — Goat's Milk, Papaya,
Lavender — and the same variant sold to Vietnam and to Malaysia is two
products in one family, told apart by `market`.

Until now this grouping was derived: `src/lib/product-groups.ts` builds the
shop's variant picker in memory from brand + name + pack size + market, and
every analytics module groups on `productId`. There was nowhere to say "these
eight rows are one thing", so nothing could be asked of the data at that
level.

`ProductFamily` gives the code one `@unique` home, a stable id that survives a
code edit, and a real key for the listing. Columns on `Product` instead
(`familyCode`, `size`) would repeat what Phase 28 fixed for labels: a family's
name would live on five to forty-six rows, a rename would be an `updateMany`,
and nothing would stop two rows carrying one code with two sizes.

The foreign key is **nullable** on purpose. The purchase-order intake path
(`createProductsForLines`) and the catalogue importer keep writing products
with no family, exactly as they write them with `needsReview: true` — a family
is something a person assigns, and "no family yet" is a state the listing
shows rather than hides.

```prisma
model ProductFamily {
  id        String    @id @default(cuid())
  code      String    @unique   // ZEN-SC-2100, ZEN-SC-1000-SCRUB
  name      String              // "Zen Garden Shower Cream 2.1L"
  brand     String?
  category  String
  size      String?             // "2.1L"; null for the sizeless lines
  products  Product[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}
```

## 2. The code

**Family:** `{BRAND}-{CATEGORY}[-{SIZE}][-{QUALIFIER}]`, through the same
`skuCode` and `sizeCode` the variant code has used since Phase 13.

```
ZEN-SC-2100          Zen Garden, shower cream, 2.1L
ZEN-SC-1000-SCRUB    the 1L shower scrub — a different product at the same
                     brand, category and size, so it carries a qualifier
MRK-DW-1500          Mr. King dishwash 1.5L
```

The qualifier is a word a person types when the base collides. It is never
inferred: the catalogue's own labels show that brand + category + size is
enough for most families and wrong for a few, and which word tells them apart
("scrub", "refill", "signature") is a judgement.

**Variant (the SKU of a new product):** `{familyCode}-{VARIANT}[-{MARKET}][-X{pack}]`.

```
ZEN-SC-2100-GM       Goat's Milk
ZEN-SC-2100-GM-VN    Goat's Milk, for Vietnam
ZEN-SC-2100-GM-X12   Goat's Milk, in the carton of 12 (when a pack clashes)
```

This is the shape `generateSku` already produced, with the family part now
stored rather than reconstructed. Because the family is a column, nothing
parses a SKU to find its product: a customer's own code (`ZEN/SC/2100/CARROT`,
kept on the seven merged production products since 2026-09-09) belongs to a
family like any generated one.

`generateFamilyCode` and `generateVariantSku` live beside `generateSku` in
`src/lib/sku.ts`, sharing its tables. `generateSku` stays for the importer and
for a product created with no family. `src/lib/extraction/match-products.ts`
is untouched: matching is on SKU, name and size, none of which change.

## 3. Assigning the 308 existing products

`scripts/backfill-product-families.ts`, with its logic in
`src/lib/product-families.ts` so it is unit-tested:

1. `--propose out.json` groups every product by brand + `groupName(name)` +
   the size read from the name — **market deliberately not in the key** —
   proposes a code per group, writes the proposal as JSON, and prints a
   report: each collision (two groups proposing one code, with their line
   text, markets and product counts), each unassigned group (no size, or only
   `needsReview` rows), and a summary line.
2. A person edits the JSON: adds a qualifier where two groups collide, or
   gives two groups one code to say they are the same family.
3. `--apply out.json [--dry-run]` refuses while any duplicate code remains,
   creates the families, and links products **by id**, never by name. It
   prints counts before and after.

Run over the real labels file before building, the numbers were: 308 products
→ 65 market-agnostic groups → 54 distinct base codes, **7 collisions**
(`ZEN-SC-2100` ×4 lines, `ZEN-SC-1000` ×3, `ZEN-HW-0500` ×2, `ZEN-HC-1000`
×3, `ZEN-BC` ×2, `LHANDS-DW-1000` ×2, `HM-HW-25000` ×2) and **8 sizeless**
groups. The qualifier is for a minority, and the review step is not optional.

## 4. Where a family shows

- **`/products`** gains a *By: Products / Families* segment. The family view
  is a `DataTable` — Family (name, code), Brand, Category, Size, Variants
  (`n · m markets`), Units · 12m, Revenue · 12m, Buyers, Status — whose row
  link is `/products?family={id}`: the product view filtered to that family,
  with a chip naming it. That is the "expand": URL as state, card mode below
  `md` for free, and the tile-and-table rule kept (the summary line reads
  "n families"). A last row, *No family (n)*, links to `?family=none`.
- **The product view** gains a Family column (the code, monospace) and the
  card's eyebrow carries it.
- **`/products/[id]`** carries the code in its eyebrow and a *Family* card
  listing the siblings — variant · market · SKU, each a link, the current
  one marked — with the family's units over twelve months.
- **`/products/new` and the edit drawer** take a `FamilyPicker`: search an
  existing family by code or name, or open *Create a family* with brand and
  category prefilled from the product, a **Size** field and an optional
  **Qualifier**, the proposed code shown live. The SKU proposal reads
  `generateVariantSku(family.code, …)` once a family is chosen; with none it
  falls back to `generateSku` with the typed size. The name is no longer
  scraped for a size.
- **`/admin/catalogue`** gains a Families section: code, name, size, product
  count (linking to the filtered list), inline rename, edit code, and Remove
  disabled while any product is in the family.
- **The shop** groups by `familyId` where one exists — `groupKey` becomes
  `(familyId ?? brand + groupName) + packSize + market` — so a rename or a
  reassignment in ops cannot leave the shop on a stale derived key. Pack size
  and market stay in the shop's key for the reason Phase 31 recorded: a buyer
  must not be offered a variant their market does not stock.

A family code can equal a variant-less product's SKU (`ZEN-SC-2100` is both a
plausible family and a plausible SKU). They live in different tables and never
conflict; on screen a family code is always under a *Family* heading or chip,
never in a SKU column.

## 5. Deliberately not built

Family-level charts on the dashboard and buyer pages: the family listing's
twelve-month units, revenue and buyers is the product-level analysis asked
for, and the charts need `familyId` on `AnalyticsLineItem` — a small later
phase. Merging two families from `/admin/catalogue`: the proposal JSON merges
before apply, and no live merge has been needed yet.

## 6. The backfill, as it ran

`--propose` over the development catalogue reported exactly the numbers
above: **308 products → 65 groups → 54 codes, 7 collisions, 8 sizeless, 0
skipped**. The decisions, kept in
`docs/imports/product-families-2026-09-15.json` the way the importer keeps
its merge map:

- **Merged into one family:** the four 2.1L shower-cream lines (`ZEN 2.1L`,
  `ZEN 2.1L NORMAL/DIY`, `2.1L ZEN SIGNATURE`, Lotus's `2.1L`) as
  `ZEN-SC-2100` *Zen Garden Shower Cream 2.1L*; the three 1L shampoo
  spellings as `ZEN-HC-1000`; olive oil's big carton and inner as `ZEN-BC`.
- **Split with a qualifier:** `ZEN-SC-1000` (the 1L cream) from
  `ZEN-SC-1000-SCRUB` and `ZEN-SC-1000-HYANGGII`; `ZEN-HW-0500` from
  `ZEN-HW-0500-PROMO`; `HM-HW-25000` (hand wash) from
  `HM-HW-25000-DISHWASH`; L.Hands' 1L dishwash as `…-CAP` and `…-PUMP`,
  which the shop already sold apart.
- **One sizeless fix:** `750MLSHOWER SCRUB`, sizeless only because the sheet
  ran the size into the next word, became `AARA-SC-0750`.

Applied: **0 products without a family, 59 families.** Two of those
decisions are judgement calls worth a second look by the business: whether
*ZEN SIGNATURE* is the same product as *NORMAL/DIY*, and whether the cap and
pump dishwash are one family or two.

**A defect in the first run of the review script, caught by the shop's card
count.** Decisions were keyed on the line text alone, and `H/WASH 500ML` is
also AA Pharmacy's line — a group that never collided. It was pulled into
`ZEN-HW-0500`, and the shop drew 82 cards where it had drawn 83. The script
now applies a decision only to a group whose code was blanked, the three
products were moved to `AP-HW-0500`, and an audit found every family
spanning exactly one brand. Worth keeping: **the shop's card count is the
cheapest check that a family decision is wrong.**

## 7. Verified in the browser, as a member and as a super admin

- **The family view.** `/products?by=family` lists **58 families** across
  six pages, no horizontal overflow at 390, 768 or 1440. Its row for
  `ZEN-SC-2100` reads *30 · 4 markets*; the row link opens
  `/products?family=…` carrying the chip **"30 variants of ZEN-SC-2100"** and
  a summary of 30 products, every card's eyebrow reading `ZEN-SC-2100`.
- **The family's figures are its variants' figures, read off both screens.**
  No line item in development links to a product, so three were pointed at
  two variants of `ZEN-SC-2100` for the check (two purchase orders, two
  buyers) and unlinked by id afterwards. The family row read **358 units ·
  RM 11,070.40 · 2 buyers**; the two product rows read 346 · RM 10,717.96 · 2
  and 12 · RM 352.44 · 1 — the sums agree to the cent, and buyers are counted
  across the family rather than added.
- **The product page** carries the family code in its eyebrow
  (`ZEN-SC-2100-CR-ID · ZEN-SC-2100 · …`) and a Family card listing all 30
  siblings as links with the current one marked.
- **The create form proposes from the family.** With only a name typed the
  SKU read `SC-2100-MY` (size scraped, no brand); choosing the family made it
  `ZEN-SC-2100-MY`; Papaya and Vietnam made it `ZEN-SC-2100-PP-VN`. Opening
  *Create a family* with size `1L` proposed `ZEN-SC-1000-…`; a qualifier
  `Scrub` made it `ZEN-SC-1000-SCRUB-PP-VN`, and Create was refused with
  **"That family code is already in use."**, staying on the form.
- **A product was created with a family described inline**, its image
  uploaded, and it landed with `familyId` set and the family at one product.
  The drawer then moved it into `ZEN-SC-2100`; after Save and a reload the
  eyebrow and the Family card both read the new family.
- **`/admin/catalogue`** answers 404 for a member and, for a super admin,
  shows a fifth section of 58 families; `ZEN-SC-2100`'s row reads *30
  products* with Remove disabled. The emptied test family was renamed and
  re-coded inline, then removed once empty.
- **The shop** still draws **83 cards** after the AA Pharmacy correction; the
  2.1L family shows as five cards titled *Zen Garden Shower Cream 2.1L* (one
  per market and pack), and the Lavender product's page offers its eight
  fragrances.
- **Sweep**: six routes × three widths, `scrollWidth === innerWidth` on all
  eighteen; every sub-44px element at 390 is an already-accepted class.
- **964/964 tests** (39 new), **`tsc --noEmit`, `npm run lint`** (the same 2
  pre-existing warnings, 0 errors) **and `npm run build` clean.**
- **Cleanup, counted both ends.** The test product, its image row, both R2
  objects (`headObject` → `NotFound` on each), the test family, the three
  line-item links, the promoted member's role and this session's one
  `LoginAttempt` row were all removed by id. Products **308**, families
  **59**, unplaced **0**, images **0**, users **2**, line items **1606** with
  **0** linked, login attempts **63**, audits **5**;
  `aisha@lovinghandsportal.com` read back as `MEMBER`.

## 8. Known, recorded rather than fixed

The imported products' family *names* are the sheet's own line text
(`ZEN 750ML`, `500ML CREAM CLEANSER`) except where a merge forced a real
name. They read fine in the listing and can be renamed in the admin room one
at a time; a pass over the 59 to give each a proper name is a job for a
person who knows the range.

Every product in every family reads *n to fix* in the family view's Status
column because the imported catalogue has no images (Phase 27's known cost),
not because of anything this phase did.

## 9. Not verified

Anything on production — the branch has not been deployed, and production's
`DIRECT_URL` still points at the pooled host (Phase 30), which this phase's
migration will hit. The backfill has not been run on production; its
catalogue differs (309 products, eight carrying the customer's own codes),
so `--propose` there must be reviewed afresh, not replayed from the
development file. The intake path that creates a product from a purchase
order was not driven; it is untouched and writes no family.
