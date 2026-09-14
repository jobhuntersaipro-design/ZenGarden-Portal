# Phase 29 — Cartons per pallet

**Goal:** A product carries the figure its own label prints —
`60CTNS/PALLET` — entered when the product is created, edited afterwards,
read in ops and on the shop. The 147 products whose sheet rows already say it
get it without anyone retyping.

**Architecture:** One nullable column, `Product.cartonsPerPallet`. No new
screen and no new action: the two product forms gain a field, the detail card
and the shop's spec list gain a row, and the catalogue importer stops
discarding a number it has been parsing since Phase 13.

**Branch:** `feature/cartons-per-pallet`, from `main`. Depends on 13, 16, 27,
28 (all on `main`).

## 1. The column

`cartonsPerPallet Int?`, migration `20260914140000_cartons_per_pallet`.
Nullable, because it is a packing fact many rows will not have until somebody
types it. Validated by the same rule as `packSize` — a whole number above
zero — which the schema now expresses once, as `wholeCount(noun)`, so both
fields say what they mean in their own message ("Cartons per pallet must be a
whole number above zero").

`ProductInput` keeps its discipline: the key is nullable and **never
optional**, so every construction of a product input had to name it and the
type checker found all six call sites.

## 2. Where it appears

| Screen | What it shows |
| --- | --- |
| `/products/new` | A field beside Pack size, captioned "As printed on the label — 60CTNS/PALLET" |
| Edit drawer | The same field, prefilled |
| `/products/[id]` | A details row, "Per pallet · 60 cartons", or `—` |
| Shop product page | A `ProductSpecs` row, "Cartons per pallet", or `—` |

The shop's product projection is narrow on purpose and asserted by shape, so
adding the column there is a deliberate widening rather than a leak: a buyer
planning a full-pallet order is the reason. Nothing else about the shop
changes — there is still no way to order by the pallet, and this figure does
not pretend there is.

## 3. The importer stops throwing it away

`parseBlock` has been stripping the pallet note out of the product line since
Phase 13 — bare (`52CTNS/PALLET`), parenthesised (`(48CTNS/P)`), spaced
(`55 CTN/PLT`) and dashed (`- 54 ctns/pallet`) — and discarding the number.
It now returns `cartonsPerPallet` beside `packSize`, and
`scripts/import-catalog.ts` writes it on create, on update and on a merge.

## 4. The backfill

`scripts/backfill-cartons-per-pallet.ts` re-reads
`docs/imports/zen-garden-dc-inventory-2026.labels.json` — the file the
catalogue itself was built from — through the same parser, and updates each
product **by exact SKU**. Never fuzzy: a code edited by hand since the import
will not match, and is printed rather than guessed at. A product that already
carries a figure is left alone; the sheet is not a better source than a person
who looked at the pallet. `--dry-run` prints the counts and the unmatched rows
first.

**Development only.** Production is untouched by this phase; running it there
is a separate decision.

## 5. Acceptance criteria

1. Creating a product with a pallet figure stores it and shows it on the
   detail page; editing it changes it.
2. The shop's product page prints it, and `—` for a product without one.
3. `parseBlock` reads the number in all four shapes the sheet writes, and
   returns null when the block carries none.
4. The backfill's dry run reports what it would set and every sheet row that
   matches no product; the real run sets exactly that many.
5. `vitest`, `tsc --noEmit`, `npm run lint` and `npm run build` clean.

## 6. Verification, 2026-09-14

- **The backfill matched everything it found.** Dry run against the
  development database: *"336 label rows → 308 products, 147 of them carrying
  a pallet count. Would set 147 products; 0 already had a figure; 0 sheet rows
  matched no product."* The real run set **147**, leaving 161 without one —
  the rows whose sheet blocks print no pallet note.
- **Checked against the customer's own label.** The photograph that prompted
  this phase reads `SUPER INDO 2.1L (6) 60CTNS/PALLET ZEN SIGNATURE`; the
  three Super Indo ZEN SIGNATURE 2.1L products came back with
  `cartonsPerPallet: 60`.
- **Ops.** `/products/[id]` read "Per pallet: 60 cartons" for a backfilled
  product. A product created through the form with 60 landed on its detail
  page with "Pack: 6 per carton · Per pallet: 60 cartons"; the edit drawer
  opened prefilled at **60**, saved **48**, and the page then read 48.
- **Shop.** `curl` on `shop.localhost` returned the product page carrying
  `Cartons per pallet</dt><dd …>60`.
- **One thing worth knowing, and it is Phase 27 working.** The drawer refused
  to save on an *imported* product — every one of the 308 has no image, and
  saving edits requires one. The round-trip above was therefore driven on a
  product created with an image, and the imported rows will each meet that
  gate once before their pallet figure can be edited by hand.
- 857/857 tests, `tsc`, lint (2 pre-existing warnings) and build clean. Test
  data removed: the probe product deleted through its own danger zone, the
  label its default market registered deleted after confirming nothing used
  it, counts back to **308 products / 124 vocabulary rows**, and
  `aisha@lovinghandsportal.com` reverted to `MEMBER`.
