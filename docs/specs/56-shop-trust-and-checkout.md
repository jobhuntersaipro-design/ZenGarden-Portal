# Phase 56 — The shop says what is true, and checkout fits a phone

Asked for as: "scan through the shop how can I improve the UI/UX and user
journey? Please list down the priority", then "write priority 1, 2, 3 to each
spec first". This is **priority 1** of three: things on screen that are
broken or misleading. Priority 2 is `57-shop-journey.md`, priority 3
`58-shop-polish.md`.

**Spec first. Nothing below is built.**

---

## 1. How this was measured

The real app, signed in as a real buyer, driven in a real browser on
2026-09-24. Not read off the code.

- A local Postgres 16 cluster, the project's own migrations and seed (423
  purchase orders, 12 products, 11 buyers). The first buyer, Acme Industrial
  Sdn Bhd, was given the market Vietnam, all twelve products were put in
  Vietnam, and a `CLIENT` (`client@example.com`) was attached to that buyer.
  `src/lib/prisma.ts` and `prisma/seed.ts` were pointed at a `PrismaPg`
  adapter for the drive and **restored afterwards**. The cluster was dropped
  and `.env.local` deleted.
- A production build (`npm start`), Chromium at **390 × 844** and
  **1440 × 900**, reduced motion on.
- The journey: shop root (redirects to sign-in) → sign in → home → catalogue →
  a product → add to cart → cart → checkout review → My orders → one order →
  a search with no results. Each page was screenshotted full length and
  measured for page overflow and sub-44px controls.

**What is already right.** No page overflows at either width. Every sub-44px
control found is in the accepted text-link class (breadcrumbs, footer rows,
"See all →"). The checkout PO-number gate works: an attempt to confirm with it
empty sent nothing and printed "Enter your PO number." under the field.

---

## 2. Findings, worst first

### F1 — Every order card on a phone is headed "—"

`/orders` at 390 renders `DataTable` in card mode, and a card's title is the
**first column**. The first column is **Order ID**
(`src/components/shop/orders/BuyerOrdersTable.tsx`, `key: "orderId"`), and an order the team
entered from a scanned PDF has no Order ID. So every one of the seeded
buyer's orders reads **"—"** as its heading, with the PO number the buyer
actually filed it under in the third row down. The page is **5,812px** long
at 390.

**Change.** Lead with the buyer's own PO number, falling back to the Order ID
where there is no PO number. In practice: make **Your PO number** the first
column (desktop and card alike) and keep **Order ID** as the second. A buyer
quotes their own number. `orderLabel` already knows this preference in the
other direction, which is why the identifier used here must be written as the
buyer-first rule rather than borrowed.

### F2 — Copy that stopped being true on 2026-09-23

Since 2026-09-23 every shop page requires sign-in. Four strings still describe
the public shop that existed before:

| Where | Says | File |
|---|---|---|
| Top strip, desktop | "Sign in only when you order" | `src/components/shop/ShopUtilityBar.tsx:14` |
| Home, How it works | "Browse without an account — Every price is on the page. Nothing is hidden behind a login." | `src/components/shop/home/HowItWorks.tsx:6` |
| Footer, Your account | "Sign in" and "Request an account" (both link to sign-in), shown to a buyer already signed in | `src/components/shop/ShopFooter.tsx:43–53` |
| Cart, under Review and send | "You'll add your own PO number **and a delivery date** next" — the delivery date left checkout on 2026-09-17 | `src/components/shop/cart/ClientCart.tsx:106` |

**Change.**

- Utility bar: replace the third item (see decision D3).
- How it works, step 1: **"Prices for your market"** / "Every price here is
  the one you pay, set for your market." (D4)
- Footer: the column becomes **My orders · Change password · Sign out**, the
  same three rows the account menu offers. "Request an account" goes: no
  access-request flow exists (Phase 18's is unbuilt), and a link to a sign-in
  page for someone signed in does nothing.
- Cart: "You'll add your own PO number next, and see everything before it is
  sent."

### F3 — A buyer is told to "ask a super admin"

The shop's product page renders the portal's `ProductGallery`
(`src/components/products/ProductGallery.tsx`). With `canEdit` false it prints
the **staff** wording:

- an image that fails to load: *"The file could not be loaded — ask a super
  admin"*;
- a product with no images: *"No images yet / Ask a super admin to add one"*.

A buyer has never heard of a super admin and cannot act on either. The second
case is **every product in production today**, because no product carries a
photo yet.

**Change.** `ProductGallery` gains `audience: "staff" | "buyer"`, required, so
neither caller can forget it (`context/lessons.md` §9). For a buyer both
states read **"Photo coming soon"**, with no second line. The portal keeps its
current wording exactly.

### F4 — Checkout on a phone buries the one required field

At 390, `/checkout/review` reads, top to bottom: the step bar, a two-line
heading, a paragraph, then the purchase-order document at **29%** zoom (the
text is not readable), then **Your own PO number** at about **y=1,060**, below
the first screen. The sticky cart bar covers part of the document. The PO
number is the only field the buyer must fill, and the gate that refuses an
empty one is correct but is met only after scrolling past the document to the
Confirm button.

On desktop the same order works: the document is legible at 100% and the
field is one scroll away.

**Change (recommended, phone only, below `md`):** the form comes first — Order
details, Deliver to, Anything we should know — then the summary and Confirm
order, and the document sits between them **collapsed** behind a full-width
**"Preview your purchase order"** button that opens it at Fit. Desktop is
unchanged.

**This reverses a decision on phones only.** On 2026-09-17 the document was
put first "wherever a purchase order is previewed", at the user's request. See
D1.

### F5 — The sticky cart bar points at the page you are on

`MobileCartBar` is pinned to every shop page below `md` whenever the cart has
something in it. On `/cart` it says **View cart** (the reader is already there)
and covers the order summary, with the real next step, **Review and send**,
underneath it. On `/checkout/review` it again says View cart, over the
document.

**Change.** The bar renders nothing on `/cart` and `/checkout/*`. Its own
comment explains why it is a secondary pill (one ink pill per screen), and
that rule is kept: the bar is not turned into a second primary action. See
D2.

---

## 3. What I would build, in order

1. F1 — the column order. One array reordered, plus a test that the first
   column of the shop order table is the PO number.
2. F2 — four copy edits and the footer column.
3. F3 — the `audience` prop and its two buyer strings.
4. F5 — hide the bar on two route families.
5. F4 — the phone layout of checkout, the largest of the five.

---

## 4. Decisions I need before building

- **D1 — Checkout on a phone.** (a) Form first, document collapsed behind a
  button (recommended). (b) Document first but collapsed, form under it.
  (c) Leave as it is. Desktop keeps the document first in every option.
- **D2 — The cart bar on /cart and /checkout.** (a) Hide it (recommended).
  (b) Keep it but make it say the next step, which breaks the one-ink-pill
  rule recorded in `MobileCartBar`.
- **D3 — The utility bar's third item.** (a) **"Your team confirms every
  order"** (recommended). (b) Drop it and keep two items.
- **D4 — How it works, step 1.** The wording in F2, or yours.

---

## 5. Acceptance criteria

1. `/orders` at 390: no card is headed "—"; every card's heading is the order's
   PO number, or its Order ID where it has none. Desktop's first column reads
   **Your PO number**.
2. None of "Sign in only when you order", "Browse without an account",
   "Nothing is hidden behind a login", "Request an account" or "and a delivery
   date" appears anywhere in the shop's rendered HTML, signed in.
3. The shop footer's account column reads My orders · Change password · Sign
   out, and Sign out signs out.
4. "super admin" does not appear anywhere in the shop's rendered HTML, for a
   product with no images and for one whose image fails to load. The portal's
   product page reads exactly as before, for both states.
5. At 390, `/cart` and `/checkout/review` have no fixed cart bar; every other
   shop page still has it when the cart is not empty.
6. At 390 (under D1a), **Your own PO number** is inside the first screen
   (top < 844) on `/checkout/review`; the preview opens and closes, and at
   1440 the page is unchanged. Confirming with an empty PO number still sends
   nothing.
7. No horizontal overflow at 390, 768 and 1440 on every page touched.
8. Before and after screenshots at 390 and 1440 for each finding.

---

## 6. Not covered

- The buyer's order history redesign (range, KPIs, chart) of
  `docs/specs/design/shop/20-order-history.md` — see Phase 57 for the parts of
  it this pass takes.
- Anything in the portal, except the `audience` prop F3 adds to a shared
  component.

---

## 7. Built, and what it measured — 2026-09-24

Built on `claude/modest-mayer-bixr87` with every decision taken as
recommended: **D1a** (form first on a phone, the document folded under it),
**D2a** (the cart bar hidden on the cart and checkout), **D3a** ("Our team
confirms every order"), **D4** as worded in F2, with the magnifier icon
swapped for a price tag.

Driven in a production build against a local Postgres 16 and the project's
seed, the same rig as §1, restored and dropped afterwards.

| Measured at 390 unless stated | Before | After |
|---|---|---|
| Order cards on `/orders` headed "—" | 60 | **0** — each card leads with `PO-2026-0072` |
| Top of **Your own PO number** on `/checkout/review` | y=1,077 | **y=636** (inside 844) |
| Same at 1440 | y=1,454 | y=1,454 — desktop unchanged |
| Cart bar on `/cart` and `/checkout/review` | shown | **hidden**; still on home and `/orders` |
| Stale strings in the shop's text, signed in | 4 on home, "super admin" on a product, "and a delivery date" on the cart | **0** |
| Horizontal overflow, every page touched, 390 and 1440 | none | none |

- **The phone preview works both ways.** "Preview your purchase order" starts
  `aria-expanded="false"`; a tap unfolds the document at Fit (350×308), and
  typing `UX-56` into the PO field puts it on the document; Hide removes it.
- **The PO gate is untouched.** Confirm with the field empty sent **0 POST
  requests**, printed "Enter your PO number." and put focus on the field.
- **The footer's account column** reads My orders · Change password · Sign
  out, the password link is `/account/password`, and Sign out signs out.
- **Tests watched failing against the old code:** the column-order test
  (`expected ['Order ID', 'Your PO number'] to deeply equal ['Your PO number',
  'Order ID']`) and both buyer gallery cases (`… to contain 'Photo coming
  soon'`). The Order-ID fallback test passes either way, because the old
  first column already showed the Order ID. 17 new tests; **1652/1652 across
  130 files**, `tsc` and `npm run build` clean, lint unchanged (the same 4
  `ShopHeader` errors and 3 warnings). The 131st file is `catalog-import`, the
  `xlsx` stand-in, as before.

**Found while driving, not fixed — pre-existing:** Sign out on the shop host
lands on the **portal** host's sign-in (`localhost:3000/signin?next=%2F`).
The header menu's Sign out does exactly the same, before and after this
change: `signOut({ callbackUrl: "/" })` is resolved against Auth.js's base
URL, the trap recorded on 2026-09-14 for the reset form. On production that
sends a buyer who signs out to `www.lovinghandsportal.com/signin`. Signing in
there still routes a client back to the shop, so nobody is stranded, but it
is the wrong host. A fix for both menus is small and belongs in its own
change.

**Not verified:** anything on production; a guest or an unassigned buyer
(neither reaches these pages since 2026-09-23); the portal's product page
with the new `audience="staff"` is covered by the unit test, not reopened.
