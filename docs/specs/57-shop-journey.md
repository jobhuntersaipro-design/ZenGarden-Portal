# Phase 57 — The buyer's journey: order again, track once, find it fast

Priority 2 of three from the 2026-09-24 shop review (see
`56-shop-trust-and-checkout.md` §1 for how it was measured). Priority 1 fixes
what is wrong; this phase fixes what is missing or slow in the journey a
business buyer takes every week: find a product, add it, track the order, and
order the same again.

**Spec first. Nothing below is built.** Depends on Phase 56 only for F1 there
(the order table's first column), which this phase's order-list changes build
on.

---

## 1. Findings, worst first

### J1 — There is no way to order the same thing again

A business buyer mostly repeats orders. Today repeating one means finding
each product in the catalogue again and re-typing each carton count. The
order page (`/orders/[id]`) shows the lines and offers nothing to do with
them.

This was already designed: `docs/specs/design/shop/20-order-history.md` §5,
**Reordering**, never built. The account menu even carries a comment for its
"Reorder your last order" lead (`src/components/shop/ShopAccountMenu.tsx:19`).

**Change.** Build §5 of Phase 20 as written, without the rest of Phase 20:

- `src/actions/reorder.ts` — `reorderOrder({ kind, id })` and `reorderLast()`.
  `requireClient()`; the order is loaded `where { id, buyerId }`; each line
  with a product that `isOrderable(product, buyerMarket)` accepts is added to
  the cart through the cart's existing upsert, **incrementing** a line already
  there; lines with no product, or a product no longer in the buyer's market,
  are skipped and **named**.
- **Order these again** — an ink pill on `/orders/[id]`, under the document.
- The toast says what happened: "3 lines added to your cart", and when
  something was skipped, "— 1 no longer available: ZEN 1L — Goat's Milk".
  Then the buyer lands on `/cart`.
- The account menu's lead row **Reorder your last order** (see D1).

The market rule is the one that matters: a product the buyer could order last
month may have left their market since, and the reorder must go through the
same `isOrderable` check the cart's own add does, never around it.
`isOrderable` is private to `src/actions/cart.ts` today (line 83); it moves
to a shared module both actions import, rather than being copied — a second
copy of a visibility rule is how the two go out of step (on 2026-09-23
`submitWebOrder` was found carrying exactly that).

### J2 — An order page shows two progress trackers, and "System" did everything

A confirmed order's page (`src/app/(storefront)/shop/orders/[id]/page.tsx`,
lines 157–175) draws a **Progress** card with the four checkout steps (Cart ·
Review · Confirm · Confirmed, all ticked), a sentence, and then the six-stage
delivery tracker (`StageStepper`) under a rule. Once an order is confirmed the
checkout steps say nothing the buyer does not know; the delivery stages are
the story.

In the delivery tracker every event reads **"· System"**: the buyer's query
nulls the actor on purpose (Phase 16, so no staff name reaches the shop), and
`StageStepper` prints " · System" for a null actor
(`src/components/purchase-orders/StageStepper.tsx:97`). So the buyer reads
that "System" moved their order into production, which is not true.

**Change.**

- A confirmed order drops the checkout step bar. The card reads **Delivery
  progress**, the sentence ("Confirmed by our team. Expected delivery
  8 Oct 2026."), then the stepper. Unconfirmed and declined orders keep the
  step bar, where it is still the story.
- `StageStepper` gains `showActor`, required, so the shop caller must say
  `false` and the portal callers `true` (`context/lessons.md` §9). A buyer's
  event reads its date alone.

### J3 — On a phone the price and Add to cart are below the first screen

At 390 the product page reads: header and search, the category strip, a
breadcrumb, a **260px** image placeholder, the brand eyebrow, a title that
sets on **four lines** at display size ("500ML FINE / FRAGRANCE / SHOWER
GEL — / Style"), the SKU line, and only then the price box, whose top is at
about **y=845** in an 844px screen. The buyer sees no price and no Add to cart
without scrolling.

**Change.**

- With no usable image, the gallery drops to a compact **h-32** tile below
  `sm` (the same fix `/products/new` took on 2026-09-08 for the same reason).
- The product title steps down one size below `sm`.
- Target: at 390 the price and the **Add to cart** button are both inside the
  first screen for the longest product name in the catalogue.

No sticky add bar. The cart bar already sits at the foot of the screen, and a
second fixed bar would cover the specs under it.

### J4 — Product cards without a photo show two letters that mean nothing

Best sellers and the catalogue draw `ProductThumb`'s initials tile where a
product has no photo: **ZD**, **M1**, **5F**, **H5**. Two letters derived from
a name identify nothing (`context/lessons.md` §8, the category-tile lesson).
The drawn category marks built on 2026-09-23 already reach `ProductThumb`
through its `fallback` prop; only the category tiles pass one.

**Change.** `ShopProductCard` passes the category's mark as the fallback, so a
product without a photo shows the drawn bottle for its category. Recorded as
not done on 2026-09-23 because `ShopProductCard` was outside what was asked.

### J5 — My orders cannot be narrowed

The seeded buyer has 60+ orders; on a phone that is **5,812px** of cards,
sortable but with no filter and no search. A buyer looking for one order
scrolls.

**Change.** From Phase 20 §4, only the filter and a search:

- chips **All orders · In progress · Delivered** (`?filter=`), through
  `useUrlNavigation`, resetting `page`;
- a search over the buyer's PO number and our Order ID (`?q=`).

The range, KPIs, spend chart and top products of Phase 20 stay out (see §4).

### J6 — Tabs are named "Zen Garden"

Read off `document.title`: the product page, the cart and the home page all
read **"Zen Garden"**, so three tabs of the same shop cannot be told apart. The
sign-in page on the shop host reads **"Sign in · Zen Garden Portal"**, the
staff product's name, on the buyer's host.

**Change.** Product page: the product's name ("ZEN 2.1L — Lavender · Zen
Garden"), resolved through `requireClient` so a product outside the buyer's
market titles the tab "Product" and leaks nothing. Cart: "Your cart · Zen
Garden". Sign-in: "Sign in · Zen Garden" on the shop host, unchanged on the
portal host.

---

## 2. What I would build, in order

1. J2 — the tracker (small, and it removes a false statement).
2. J6 — titles.
3. J4 — card fallback marks.
4. J3 — product page on a phone.
5. J5 — filter and search on My orders.
6. J1 — reordering, the largest, with its own tests.

---

## 3. Decisions I need before building

- **D1 — Where "order again" appears.** (a) On each order's page and as a
  "Reorder your last order" row in the account menu (recommended). (b) Also on
  every row of My orders. (c) Order page only.
- **D2 — After reordering.** (a) Go to the cart (recommended, what Phase 20
  says). (b) Stay on the order page with a toast and a "View cart" link.
- **D3 — The rest of Phase 20** (range, KPIs, spend chart, top products).
  (a) Leave for later (recommended). (b) Build with this phase.

---

## 4. Acceptance criteria

1. **Order these again** on a three-line order adds three cart lines with the
   order's cartons; pressing it again doubles the cartons and still leaves
   three lines (`SELECT count(*)` on the DRAFT's lines stays 3).
2. With one of the order's products moved out of the buyer's market, the
   reorder adds two lines and the toast names the third. Another buyer's order
   id is refused, and a guest is refused.
3. A confirmed order's page has one tracker; no event on it reads "System";
   the portal's purchase-order page still shows its actors.
4. At 390 the product page's price and Add to cart are both above y=844 for
   the longest product name in the seed.
5. No product card in the shop shows a two-letter initials tile.
6. My orders' filter and search narrow the rows and the count together; a
   search for a PO number returns that order; changing the filter resets to
   page 1.
7. The product, cart and shop sign-in tabs are named as in J6.
8. No horizontal overflow at 390, 768 and 1440; before and after screenshots
   at 390 and 1440.

---

## 5. Not covered

- Phase 20's history analytics (D3).
- Saving a cart as a named template, or scheduled repeat orders. Nobody asked,
  and "order again" answers the same need first.
