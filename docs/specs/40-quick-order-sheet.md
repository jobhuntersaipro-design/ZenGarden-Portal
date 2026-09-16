# Phase 40 — The quick-order sheet

**Goal:** A buyer runs down the whole catalogue on one screen, types a
carton count against each flavour they want, and adds the lot to their cart
in one action — without opening a product page. Asked for as: "my ultimate
goal is to let buyer select multiple variants under a product when shopping",
refined with the user on 2026-09-16 to the catalogue-wide sheet that is the
wholesale standard, for guests as well as signed-in buyers.

**Architecture:** No migration and no new dependency. One new route on the
shop host, `/quick-order`, reading the catalogue through the same visibility
rule, filters, grouping and sort as `/products` but unpaged and without
images, and writing through the batch cart operations Phase 39 built
(`addManyToCart` for a signed-in buyer, `guestCart.addMany` for a guest).
What is new is one screen and one pure helper.

**Branch:** `feature/quick-order-sheet`, stacked on `feature/variant-creation`
(Phase 39), which is itself stacked on the unmerged Phases 36–38. Phase 39's
browser-pass data is still in the development database and its role
promotion still stands at the time of writing; that cleanup precedes this
branch, not follows it.

**Decisions taken with the user (2026-09-16):**

1. **A catalogue-wide sheet, not a bigger buy box.** Phase 39 already gives
   the product page a quantity per flavour. The gap is the buyer who orders
   twenty lines across the range and should not open twenty pages.
2. **Guests too.** A guest fills the sheet into their `localStorage` cart and
   signs in at send, exactly as they do from a card today.
3. **A row per flavour, grouped under its product.** Not a matrix: flavour
   sets differ per product (Papaya / Lavender / Goat's Milk against Lemon /
   Lime), so a flavour-column grid would be mostly empty cells.
4. **Entry point: a "Quick order" link in the shop header beside the cart**,
   on every page, for every audience. No home tile, no account-menu row.

## 1. What is missing

The shop groups a product's flavours onto one card (Phase 31), lets a buyer
pick one from the card, and — since Phase 39 — lets them set a quantity per
flavour on the product page and add them together. Every one of those is
per product. A wholesale buyer's order is per catalogue: the purchase orders
this portal was built to read carry ten to forty lines across brands and
sizes, and the person keying that in from a spreadsheet has to visit a page
per product and remember where they were.

Every B2B ordering platform the industry uses answers this with the same
screen: every product and every variant on one page, a quantity box each,
one add. That is the screen.

## 2. Data: the catalogue, unpaged, without pictures

`listShopProducts` in `src/lib/queries/shop-catalogue.ts` already reads every
visible product that matches the query (`baseWhere`, then the facet
filters), groups them with `groupProducts`, sorts them, and only then slices
a page of `SHOP_PER_PAGE` and reads that page's images. The sheet wants
exactly the first half and none of the second.

The grouping-and-sorting half is extracted into an internal
`catalogueGroups(query)` that both callers use — so the sheet and the
catalogue cannot disagree about what is on offer or in what order — and
`listQuickOrderSheet(query)` returns every group with its variants in a
lighter shape: `ShopProduct` without `imageUrl`. No signed URLs, no second
read. On the development catalogue that is 83 groups over 308 products in
one query, which is what the catalogue page already runs before it pages.

`ShopCatalogueQuery` is reused whole (`parseShopQuery`, `shopQueryHref`),
so search, category, brand, market and sort mean the same thing on both
screens, and a filtered catalogue URL can be turned into the same filtered
sheet. `page` is parsed and ignored.

## 3. The screen

`/quick-order` on the shop host, under the shop layout — header, category
strip and footer as every other shop page.

**Filter bar**, sticky under the header: the catalogue's own search box and
category, brand and market selects, plus the sort. Changing one navigates
(`shopQueryHref`), as the catalogue does, so a filtered sheet has a URL.
Quantities already typed are client state and survive a filter change —
the row may be hidden, the quantity is not lost — and a caption beside the
total says how many lines the current filter is hiding, so nothing is
forgotten silently. See §4.

**The sheet.** Above `md`, a table. A heading row per group reading the
card's title — *Zen Garden Shower Cream 2.1L · 6 per carton · Malaysia* —
then one row per flavour beneath it:

| flavour | SKU | pack | per carton | in cart | quantity |
|---|---|---|---|---|---|
| Papaya | `ZEN-SC-2100-PP-MY` | 6 per carton · 60 per pallet | RM 189.00 | 2 | *stepper* |

The flavour cell links to the product page, so the sheet is also a way to
reach a picture. The quantity is `CartonStepper` with `min 0`, the control
the product page's rows use, so a sheet row and a product-page row behave
identically. *In cart* reads `useCartCount(productId)`, which serves both
audiences already; a row already in the cart says so before the buyer adds
to it — the awareness Phase 39's product-page rows still lack.

Below `md`, each group becomes a card: the heading, then flavour rows each
carrying label, price, in-cart and the same 44px stepper, stacked. This is
`VariantBuyRows`' layout, and where the two can share a row component they
do.

**The footer**, sticky at the bottom: *N cartons across M lines*, the RM
total summed with `sumDecimals` over `lineTotal`'s own strings, and one
**Add to cart** — disabled while every quantity is 0, pending while the
write runs, every stepper disabled with it.

**Empty states.** No products match the filter: the catalogue's own message
and a clear-filters link. A catalogue with nothing on offer at all: the same.

**Header.** Desktop: a **Quick order** link before the Cart pill, styled as
the secondary control the design system gives a header (not a second ink
pill). Mobile: a 44px icon link beside the cart with an accessible name.

## 4. The write

The sheet holds one `Record<productId, cartons>`. Add to cart turns it into
lines with a quantity above 0 — visible rows first in sheet order, then any
rows the current filter hides in the order they were entered — through a
pure helper (`buildSheetLines`) that also chunks them at the batch cap.

**A signed-in buyer:** `addManyToCart({ lines })` per chunk of at most 100
lines — the existing `addManyToCartSchema` cap, kept rather than raised.
Chunks are sent in order; each is one transaction. If a later chunk fails,
the toast says how many lines landed and that the rest did not, and the
quantities of the lines that did not land are kept on the sheet for a
retry. `skipped` counts (a product that left the shop between load and
click) reach the toast as they do from the product page.

**A guest:** `guestCart.addMany(lines)`. The guest cart is capped at
`MAX_GUEST_LINES` (100) and `addLines` skips new lines past it silently.
The sheet does not rely on that: before writing it checks how many new
lines the cart can still take, and if the sheet would exceed it, refuses
with a message naming the number and adds nothing — a partial guest add
with no record of what was dropped is worse than none.

**After success** every quantity resets to 0, so a second click cannot send
the same lines twice — Phase 39's rule. The toast reads *N cartons across
M lines added to your order.* (singular forms where either is 1).

**Hidden lines.** A quantity typed on a row that a later filter hides is
still in the map. The footer's *M lines* counts it and a caption says *k of
these are hidden by the current filter*; Add to cart sends them. A buyer
who wants to drop them clears the filter and zeroes them.

## 5. Acceptance criteria

1. `/quick-order` on the shop host renders for a guest and for a signed-in
   `CLIENT`; on the portal host it is not a route.
2. With no filter, every visible product row appears exactly once, grouped
   under the same headings the catalogue draws as cards — the group count
   equals the catalogue's unfiltered `total`, read from both.
3. A product that is archived, `needsReview`, or unpriced does not appear —
   the same rule as the catalogue, proven by flipping one and reloading.
4. `?category=` / `?brand=` / `?market=` / `?q=` narrow the sheet exactly as
   they narrow the catalogue: the same URL on both routes yields the same
   set of products, compared by id.
5. Typing 3 on one flavour and 2 on another and pressing Add to cart once
   yields, for a signed-in buyer, two `WebOrderLine` rows with cartons 3 and
   2 — one action, one round trip.
6. The same as a guest writes two lines to `localStorage["lh-shop-cart"]`
   carrying product ids and cartons and no price anywhere in it.
7. A row already in the cart shows its count before the click, and adding
   to it increments the line rather than duplicating it.
8. After a successful add every quantity reads 0 and the button is disabled.
9. 101 or more lines for a signed-in buyer are sent as two chunks and all
   land; `WebOrderLine` count read back equals the lines sent.
10. A guest sheet that would take the cart past 100 lines is refused before
    any write, with a message naming the number, and `localStorage` is
    unchanged.
11. Every quantity control and the Add to cart button is at least 44px at
    390px; no horizontal overflow at 390 / 768 / 1440 on an unfiltered sheet.
12. The header link is present on every shop page for both audiences and
    reaches the sheet; the account menu and home page are unchanged.
13. A filter that hides a row with a quantity typed on it is reported in
    the footer caption, and Add to cart still sends that line.

## 6. Testing

**Unit.** `buildSheetLines`: drops zero and blank quantities, preserves
sheet order, chunks at the cap with the remainder last, and handles an
empty map. `catalogueGroups`: the catalogue and the sheet see the same
groups for the same query — pinned by one test calling both. The cart
actions are already covered.

**Browser, as a real buyer and a real guest.** Criteria 1–13 driven on the
development database with counts read before and after, every row this
pass creates deleted by id, and the throwaway `CLIENT` removed — the
standing rule since Phase 25.

## 7. Known, and out of scope

- **No artboard exists for this screen.** Like `/products/new`, it is
  derived from screens that do have one — the cart table's row anatomy and
  the product page's stepper rows — and the canvas is behind the code until
  someone draws it. `CLAUDE.md` makes the canvas the visual authority; this
  is a recorded deviation.
- **Not in v1, each a clean later addition:** reorder from a previous order
  (signed-in only; reads the last `WebOrder`'s lines into the map); paste a
  list of `SKU, cartons`; per-buyer pricing (no such data exists);
  remembering an unsent sheet across navigation (quantities are client
  state and go when the page does — the cart is where kept things live).
- **The product page's flavour rows still show no in-cart count.** The sheet
  does; lifting the same cell into `VariantBuyRows` is a one-line follow-on
  recorded against Phase 39.
- **Chunked adds are not one transaction across chunks.** A buyer sending
  150 lines whose second chunk fails has 100 in the cart and 50 kept on the
  sheet, and is told so. Raising the per-batch cap instead would trade that
  honesty for a single 150-upsert transaction; the cap stays.
