# Phase 58 — Shop polish

Priority 3 of three from the 2026-09-24 shop review (see
`56-shop-trust-and-checkout.md` §1 for how it was measured). Small things that
read slightly wrong. None of them blocks a buyer.

**Spec first. Nothing below is built.**

---

## 1. Findings

### P1 — An empty search says "Nothing yet"

`/products?q=zzzz` reads **"All products · Nothing yet"** above a card saying
"Nothing matches that. Try a different search." Two problems: the heading
still says *All products* while a search is filtering it, and "Nothing yet"
describes a shop that has no stock, not a search that found nothing
(`src/app/(storefront)/shop/products/page.tsx:21` and `:91`).

**Change.** While a search is active the heading reads **Results for
"zzzz"** and the count **No products match**. The empty card keeps its Clear
the filters button and adds the category chips under it, so the buyer has
somewhere to go next without retyping.

### P2 — The cart prints the pieces twice

Each cart line reads "RM 312.00 per carton · 48 pieces" in its meta line
(`src/components/shop/cart/CartLines.tsx:94`) and **"48 pieces"** again under
the carton stepper. Two copies of one figure, a line apart.

**Change.** Keep the one under the stepper, which moves as the count moves,
and drop it from the meta line.

### P3 — The product's spec table prints rows with nothing in them

`ProductSpecs` prints **"Cartons per pallet —"** (and a dash for any other
empty value) on purpose: its comment cites §5.4 of the shop design, which
keeps every row so the table has the same shape on every product.

To a buyer a dash is a question with no answer. See D1.

---

## 2. Decisions I need before building

- **D1 — Empty spec rows.** (a) Hide a row with no value (recommended; the
  design's rule was written for staff, who fill the values in). (b) Keep the
  dashes as the design says.

---

## 3. Acceptance criteria

1. `/products?q=zzzz` reads Results for "zzzz" and No products match, and the
   empty card offers the categories. An unfiltered catalogue reads as before.
2. A cart line shows its pieces once.
3. Under D1a, a product with no pallet figure shows no Cartons per pallet
   row; a product with one shows it.
4. No horizontal overflow at 390 and 1440; before and after screenshots.

---

## 4. Built, and what it measured — 2026-09-24

Built on `claude/modest-mayer-bixr87` with **D1a** (hide a row with no
value). One finding from the Phase 57 drive was folded in, as offered: the
order page's Lines card at 390.

Driven in a production build against a local Postgres 16 and the project's
seed (the rig of Phase 56 §1, dropped afterwards), before on `main` at
`000e573` and after on this change, signed in as a Vietnam buyer.

| Measured | Before | After |
|---|---|---|
| `/products?q=zzzz` heading · count | All products · Nothing yet | **Results for "zzzz" · No products match** |
| Categories offered in the empty card | 0 | **7** (every category in the buyer's market), 44px at 390 |
| "24 pieces" in one cart line | 2 | **1**, under the stepper |
| Spec rows on a product with no pallet figure or variant, at 390 and 1440 | 7, two of them "—" | **6**, no Cartons per pallet row; Variant shows because this product has one |
| Order page Lines card at 390: description width × height | **31 × 84px**, one word per line, "H/WASH" printed over its quantity | **300 × 21px**, one line |
| Horizontal overflow, every page touched, 390 and 1440 | none | none |

- **The Lines card was lessons §4's flex shape**: a `flex-1` item's basis is
  0%, so it always fitted beside the figures and got the 31px they left. It
  takes `basis-full` below `sm` now, and its old place above.
- **Watched failing:** the cart-line test against the old line reported
  `expected [ '48 pieces', '48 pieces' ] to have a length of 1 but got 2`.
- 10 new tests; **1684/1684 across 137 files**, `tsc` and `npm run build`
  clean, lint unchanged (the same 4 `ShopHeader` errors and 3 warnings).

**Not verified:** anything on production; an unfiltered catalogue with no
products at all (the "Nothing yet" wording is kept for it and unit-tested).
