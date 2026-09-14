# Phase 31 — Product variants

**Goal:** A buyer sees one product with its flavours, not eight products.
Asked for as: "a product should have multiple variant shown to the buyer, for
example GOAT'S MILK/PAPAYA instead of different product."

**Architecture:** No migration, no new column, no ops screen. A card is a
**group** derived from what a product already carries. Every flavour keeps its
own row, SKU, price, images and product page, so ops, the catalogue importer
and the purchase-order matching path are untouched.

**Branch:** `feature/product-variants`, from `main`.

## 1. What a group is

`src/lib/product-groups.ts` is pure: no Prisma import, no I/O, 19 unit tests.
Two products are the same product when they share

| Part | Why it is in the key |
| --- | --- |
| brand | two brands are two products |
| group name | the name with the flavour taken off the end |
| pack size | the same cream by 6 and by 12 is a different thing to order |
| market | `2.1L ZEN SIGNATURE` exists under both `Super Indo` and `Lotus` |

The parts are joined with a NUL, so brand `A` with name `B C` cannot collide
with brand `A B` with name `C`. A test pins that; a space or a pipe fails it.

**The group name is the only derived part, and it exists because the catalogue
holds two naming conventions.** Typed in ops the flavour stays out of the name
(`Zen Garden Shower Cream 2.1L`, `variant: "GOAT'S MILK"`); written by the
Phase 13 importer it is appended (`ZEN 2.1L NORMAL/DIY — Papaya`,
`variant: "Papaya"`). `groupName` removes a trailing `" — {variant}"` **only
when it is really this product's own variant**, matched case-insensitively, so
a name that merely contains a dash keeps every character and
`H/WASH 500ML (7/LAYER X 8)` is never truncated. Measured against the real
catalogue: 0 names carry a dash that is not their own flavour.

## 2. What it does to the catalogue

| Measure | Before | After |
| --- | --- | --- |
| Cards in the shop | 308 | 83 |
| Cards offering a choice of flavour | 0 | 81 |
| Largest group | 1 | 8 |
| Groups whose flavours differ in price | n/a | 0 |

The user's own example comes out as one card, `ZEN 2.1L NORMAL/DIY`, offering
Avocado, Carrot, Goat's Milk, Green Tea, Lavender, Oat Milk, Papaya and Royal
Jelly.

## 3. Where the work happens

`listShopProducts` now reads **once**, narrowly, and groups, facets, sorts and
pages in memory, where it used to issue six queries that each answered about
rows. It has to: the group key is partly derived, so the database cannot group
on it. A second read then fetches the full rows, images included, for the
cards on this page alone, so no thumbnail is ever signed for a card nobody is
looking at.

Counting follows the same rule. `83 products` counts cards, and so does every
facet, because that is what the reader is looking at. A facet still leaves its
own filter out of its own counts, so a chip still answers "what would I get if
I also ticked this".

## 4. The two pickers

| Where | Control | Why |
| --- | --- | --- |
| Catalogue card, below `sm` | native `<select>`, 44px | eight chips measured 28px tall and scrolled inside the card |
| Catalogue card, `sm` and up | radio-group chips | one choice among several, arrow keys for free |
| Product page | links, 44px, `aria-current` on the current one | each flavour is a real page, so choosing one is a navigation and stays shareable |

Choosing a flavour on a card switches its picture, price, link and **Add to
cart** without leaving the page. A group of one renders exactly the card it
always did.

`relatedShopProducts` now excludes the product's own flavours: they are
already on the page in the picker, and offering them again under "More from
{brand}" would present the same choice twice.

## 5. Verified in the browser, against the real catalogue

- `/products` reads **83 products**, 24 cards on page one, 22 carrying a picker.
- On `ZEN 2.1L NORMAL/DIY`, choosing **Papaya** moved the card's link from the
  Avocado product to the Papaya one, and `localStorage` then stored
  `productId: cmtvckw9h000203otpbz0v4x0` — the Papaya id, not the default. The
  cart shows `ZEN 2.1L NORMAL/DIY — Papaya · RM 220.50`.
- On the product page, the picker lists all eight, `aria-current` sits on
  Papaya, and clicking Avocado navigates to that product with `aria-current`
  moving with it. "More from Zen Garden" offers `2.1L ZEN SIGNATURE`, a
  different group, and no sibling.
- Sweep at 390/768/1440 on the catalogue and a product page: six combinations,
  `scrollWidth === innerWidth` on all. At 390 the select is 44px and the chips
  are hidden; at 768 and 1440 the chips are shown and the row does not clip.
  The only sub-44px elements left at 390 are the already-accepted classes —
  the skip link, the search field, the category nav chips and footer links.
- Console: 0 errors across home, catalogue, product page and cart.

**One defect found by the browser that the build could not.** `singleGroup`
was first exported from `ShopProductCard`, a `"use client"` module, and the
product page threw *"Attempted to call singleGroup() from the server"* — a
server component may render a client module's components but cannot call its
functions. It lives in the query module now, beside the type it builds.

## 6. Known, recorded rather than fixed

- Development holds three pairs the Phase 13 importer created with collision
  suffixes: `ZEN-SC-1000-CH` beside `ZEN-SC-1000-CH-2`, identical in name,
  flavour and price. They land in one group as two chips, so `variantLabels`
  appends the SKU to tell them apart rather than drawing two identical
  buttons. Which of each pair is real is the customer's to say.
- Every imported product has no image, so variant cards show placeholders
  until Phase 27's requirement is met per product.
- Grouping is computed per request over the shop-visible set. At 308 products
  that is a narrow read and nothing more; if the catalogue reaches a few
  thousand, the group key belongs in SQL or in a stored column.

## 7. Not verified

Anything on production. Production holds **one** active product, so no group
of more than one exists there to look at; this was built and checked against
the development catalogue.
