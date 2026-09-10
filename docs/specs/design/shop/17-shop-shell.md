# Phase 17 — Shop shell and guest browsing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anyone who finds the shop host can browse the home page, the catalogue and every product, build a cart by the carton, and see today's prices — and a client who signs in finds that cart waiting in their account.

**Architecture:** The storefront stays at real paths under `/shop`, rewritten from the shop host by `src/proxy.ts`; the proxy stops demanding a session for public shop paths and keeps demanding one for a short list of private ones. The layout resolves a *viewer* — guest or client — once, and every component reads it from context. A guest's cart lives in `localStorage` as product ids and carton counts, priced on every read by a public Server Action that returns only what the catalogue already shows; a client's cart is the Phase 16 `DRAFT` `WebOrder`, untouched. One Server Action merges the first into the second on sign-in.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 tokens from `src/app/globals.css`, Prisma 7, shadcn `popover`/`checkbox`/`select`/`dropdown-menu`, Vitest.

**Spec:** this file, `docs/specs/design/shop/00-overview.md`, the canvas artboards `Shop.dc.html` (prototype), `Main`, `Catalogue`, `Product`, `Cart`, `Mobile`. Read `docs/specs/16-storefront.md` §3, §4 and §8 for what already exists.

**Branch:** `feature/shop-shell`. Depends on 16.

## Global constraints

- Every `<Link>` in storefront code is browser-relative through `shopHref`; every `revalidatePath` names the real path through `shopPath` (`src/lib/shop-routes.ts`). Never hand-written.
- Tokens only. No raw hex, px or arbitrary Tailwind value in a component. The prototype's palette maps onto `@theme` per `docs/design/storefront/_parts.md`; `#7612fa` is `focus`/`share-1` and is used only as a text/border colour or inside `bg-brand-gradient`, never as a flat fill.
- A Server Action callable without a session reads `SHOP_VISIBLE` products and nothing else, takes bounded input (Zod), and writes nothing.
- The cart stores product ids and cartons and never a price. `submitWebOrder` remains the only place a price is written (16 §3).
- Money through `formatMYR` and `lineTotal`; never float arithmetic.
- Sentence case everywhere except the hero eyebrow, which the canvas draws uppercase.
- Zero horizontal page overflow at 390, 768 and 1440px on every route this phase touches.
- One dark pill per screen, with the single recorded exception below (§5.3).

---

## 0. Why this exists

Phase 16 proved the loop — a client browses, orders by the carton, ops confirms, the client watches the stage move. It did so behind a sign-in wall, with a list-shaped catalogue and a cart page that also did the sending. The customer then drew what they actually want their buyers to meet: a storefront in the Lazada shape, open to anyone, with a home page, a category strip, filters in a top bar, a product page with a buy box, and a cart that asks for an account only when the order is sent.

This phase builds that shell. It ends where the canvas's *Sign in to send this order* button begins: a guest reaches the cart with a full basket and a button that takes them to sign-in; Phase 18 builds the gate that button opens.

## 1. Routes

What the client's browser sees → the file that serves it. Every new route is added to `src/lib/shop-routes.ts`.

| Browser path | File | Who |
|---|---|---|
| `/` — home | `src/app/(storefront)/shop/page.tsx` (rewritten: the catalogue moves out) | anyone |
| `/products` — catalogue | `src/app/(storefront)/shop/products/page.tsx` (new) | anyone |
| `/products/[id]` | existing, restyled | anyone |
| `/cart` | existing, rewritten | anyone |
| `/orders`, `/orders/[id]` | existing, untouched this phase | client |
| `/signin` | shared auth route, untouched | anyone |

```ts
// src/lib/shop-routes.ts — additions. Existing entries unchanged.
export const shopHref = {
  home: () => "/",
  /** `/products?category=…&brand=a,b&page=2`. Empty values are dropped. */
  catalogue: (params: Record<string, string | undefined> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    const query = search.toString();
    return query ? `/products?${query}` : "/products";
  },
  product: (id: string) => `/products/${id}`,
  cart: () => "/cart",
  orders: () => "/orders",
  order: (id: string) => `/orders/${id}`,
  /** The shared sign-in card; `next` is a browser-relative path. */
  signIn: (next?: string) =>
    next ? `/signin?next=${encodeURIComponent(next)}` : "/signin",
} as const;

export const shopPath = {
  home: () => SHOP_ROUTE_PREFIX,
  catalogue: () => `${SHOP_ROUTE_PREFIX}/products`,
  product: (id: string) => `${SHOP_ROUTE_PREFIX}/products/${id}`,
  cart: () => `${SHOP_ROUTE_PREFIX}/cart`,
  orders: () => `${SHOP_ROUTE_PREFIX}/orders`,
  order: (id: string) => `${SHOP_ROUTE_PREFIX}/orders/${id}`,
} as const;

/**
 * Shop-host paths that need a client session. Everything else on the shop
 * host is public. Later phases append here (18: /checkout/review,
 * /checkout/sent; 19: /purchase-orders; 21: /settings) and nowhere else.
 */
export const SHOP_PRIVATE_PATHS = ["/orders"] as const;

export const isShopPrivatePath = (pathname: string) =>
  SHOP_PRIVATE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
```

## 2. The proxy: the shop host is public

`src/proxy.ts` today redirects every unauthenticated request that is not in `PUBLIC_PATHS` to `/signin`. On the shop host that has to become: **public unless private**.

```
── shop host ──────────────────────────────────────────────────────────
  /api/auth/*                          → next()                (unchanged, first)
  PUBLIC_PATHS + /account/password     → next()                (shared, unprefixed)
  no session, isShopPrivatePath        → /signin?next=…
  no session, otherwise                → rewrite /x → /shop/x   (NEW: guests browse)
  session, mustChangePassword          → /account/password
  session, otherwise                   → rewrite /x → /shop/x
── portal host ────────────────────────────────────────────────────────
  unchanged
```

Two things must not change: the proxy still imports nothing heavy (it reads `process.env` and the JWT; `shop-routes.ts` has no imports, so it may be imported), and a `CLIENT` on the portal host and staff on the shop host are still redirected by the **layouts**, not here — the 2026-09-09 cross-host redirect loop (15 §3) is the reason.

## 3. The viewer

```ts
// src/lib/shop-viewer.ts
import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export type ShopViewer =
  | { kind: "guest" }
  | {
      kind: "client";
      id: string;
      name: string;
      email: string;
      image: string | null;
      buyerId: string;
      buyerName: string;
    };

export const GUEST: ShopViewer = { kind: "guest" };

/**
 * Who is looking at the shop. "staff" is returned rather than a viewer so the
 * layout can redirect them to the portal — the half-state a member browsing
 * the shop would create is the one 15 §3.2 removed, and it stays removed.
 *
 * Reads the row, not the token, for the same reason `requireClient` does:
 * a revoked contact has to stop now, not within five minutes.
 */
export async function loadShopViewer(): Promise<ShopViewer | "staff"> {
  const session = await getSessionUser();
  if (!session) return GUEST;
  if (session.role !== Role.CLIENT) return "staff";
  const row = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      image: true,
      buyerId: true,
      buyer: { select: { name: true } },
    },
  });
  if (!row?.buyerId || !row.buyer) return GUEST;
  return {
    kind: "client",
    id: session.id,
    name: row.name,
    email: row.email,
    image: row.image,
    buyerId: row.buyerId,
    buyerName: row.buyer.name,
  };
}
```

`ShopViewerProvider` (`src/components/shop/ShopViewer.tsx`, client) puts the viewer in React context; `useShopViewer()` reads it. The layout resolves the viewer once and passes it down; **pages that must be private still call `requireClient()` themselves**, because the proxy's private-path list is defence in depth and the page is the authority.

The layout also loads the client's cart summary in the same pass, so the header badge, the mobile bar and every card's *In cart (n)* label read one query:

```ts
// src/lib/queries/cart.ts — addition, replaces cartCount's callers
export type CartSummary = {
  count: number;          // lines
  cartonCount: number;
  subtotal: string;       // priced live, unavailable lines excluded
  lines: { productId: string; cartons: number }[];
};
export async function cartSummary(placedById: string): Promise<CartSummary>;
```

## 4. The guest cart

**Where it lives.** `localStorage["lh-shop-cart"]`, JSON, `{ v: 1, lines: [{ productId, cartons }], updatedAt }`. Nothing else — no name, no price, no image. What the reader sees is fetched on every read, so the guest cart has the same property the client cart has: a stale price is unrepresentable.

**Pure module** `src/lib/guest-cart.ts` — no `window`, fully unit-tested:

```ts
import { MAX_CARTONS_PER_LINE } from "@/lib/validation/cart";

export type GuestCartLine = { productId: string; cartons: number };
export type GuestCart = { v: 1; lines: GuestCartLine[]; updatedAt: string };

export const GUEST_CART_KEY = "lh-shop-cart";
/** A guest basket past this is not a wholesale order, it is a script. */
export const MAX_GUEST_LINES = 100;
export const EMPTY_GUEST_CART: GuestCart = { v: 1, lines: [], updatedAt: "" };

/** Tolerant: bad JSON, a wrong version or junk lines all come back empty or clamped. */
export function parseGuestCart(raw: string | null): GuestCart;
export function addLine(cart: GuestCart, productId: string, cartons: number): GuestCart;  // increments an existing line, clamps to MAX_CARTONS_PER_LINE
export function setLine(cart: GuestCart, productId: string, cartons: number): GuestCart;  // cartons <= 0 removes
export function removeLine(cart: GuestCart, productId: string): GuestCart;
export const guestCartonCount = (cart: GuestCart) => number;
export const guestCountOf = (cart: GuestCart, productId: string) => number;
```

**Pricing** is one public Server Action:

```ts
// src/actions/shop-public.ts   "use server"
/**
 * Prices a guest's basket at today's list price. No session, no guard: it
 * reads only products, returns only what a product card already shows, and
 * writes nothing. Unknown ids are dropped; a product that has left the shop
 * comes back `unavailable`, exactly as loadCart marks it for a client.
 */
export async function priceCart(
  lines: GuestCartLine[],
): Promise<ActionResult<Cart>>;
```

It shares one function with `loadCart` so the two carts can never price differently:

```ts
// src/lib/queries/cart.ts — extracted from loadCart, exported
export function priceProductLines(
  rows: { productId: string; cartons: number; product: PricedProductRow }[],
): { lines: CartLine[]; subtotal: string; cartonCount: number };
```

`CartLine` gains `imageUrl: string | null` (the cart rows on the canvas carry an 88px thumbnail); the select adds `images: { take: 1, orderBy: position }` and reuses `thumbUrl` from `shop-catalogue.ts` (export it).

**Provider** `src/components/shop/GuestCartProvider.tsx` (client): owns the `GuestCart`, reads `localStorage` after mount (never during SSR), writes on every change, listens to the `storage` event so two tabs agree, and calls `priceCart` — debounced 300 ms — whenever the lines change, holding the last `Cart` for the summary, the mobile bar and the checkout column. Inert for a client viewer.

```ts
export type GuestCartApi = {
  hydrated: boolean;
  cart: GuestCart;
  priced: Cart | null;       // null until the first priceCart answers
  pricing: boolean;
  add: (productId: string, cartons: number) => void;
  set: (productId: string, cartons: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};
export function useGuestCart(): GuestCartApi;
/** Cartons of one product in whichever cart the viewer has. */
export function useCartCount(productId: string): number;
```

**Merge.** When a guest becomes a client their basket moves into the `DRAFT` `WebOrder`:

```ts
// src/actions/cart.ts — addition
/**
 * Every line is added through the same upsert `addToCart` uses, so a product
 * already in the account's cart increments rather than duplicating. Lines
 * whose product has left the shop are skipped and counted, never silently
 * dropped.
 */
export async function mergeGuestCart(
  lines: GuestCartLine[],
): Promise<ActionResult<{ merged: number; skipped: number }>>;
```

`GuestCartMerge` (`src/components/shop/GuestCartMerge.tsx`, client, mounted once in the layout): on mount, if the viewer is a client and `localStorage` holds lines, call `mergeGuestCart`, clear storage on success, toast *"Your cart moved to your account"* (with *"… — n lines are no longer available"* when skipped), and `router.refresh()`. A ref guards against React's double-invoked effect running the merge twice. This covers every way of signing in — the shared `/signin`, the Phase 18 gate, the forced password change — without touching auth code.

## 5. The screens

Measurements are the canvas's; the token beside each is what to write.

### 5.1 Shell — `ShopUtilityBar`, `ShopHeader`, `CategoryStrip`, `ShopFooter`, `MobileCartBar`

- **Utility bar**: `bg-ink text-canvas/80`, `text-[length:var(--text-caption)]`, page-width row: "Wholesale personal care · Malaysia" left; "All prices in MYR · Sold by the carton · Sign in only when you order" right. Hidden below `md`.
- **Header** (`sticky top-0 z-30 bg-canvas border-b border-hairline`, page width `max-w-page`, `py-[18px]` → use `py-md` (20px) as the nearest step): `Wordmark` linking home; a search `<form action="/products" method="get">` — pill input (`h-control-md rounded-pill border-hairline-strong`, placeholder *Search the catalogue — try “lavender” or “2.1L”*, `name="q"`, `defaultValue` from the URL) with an ink *Search* button inside (`h-8 rounded-pill px-md` — `h-8` is Tailwind's own 32px step); the **Cart** pill (`h-control-md rounded-pill bg-ink text-canvas px-md`, cart icon, "Cart", count badge `rounded-pill bg-canvas text-ink text-[length:var(--text-caption)]` shown when > 0 — a client component `CartBadge` that reads the guest cart or the server summary); then **Sign in** (`text-brand-link font-medium`, → `shopHref.signIn()`) for a guest or the **account menu** (§5.7) for a client.
- **Category strip** under the header row: `All products` + every category in the shop (`listShopCategories()` — `SHOP_VISIBLE` distinct), `gap-[28px]` → `gap-lg` (24px) is the nearest token, `h-control-md` rows, `overflow-x-auto`; the active one is `font-semibold text-ink border-b-2 border-focus`, the rest `text-ink-secondary hover:text-ink`. Active = `?category=` on `/products`; on `/` nothing is lit; `All products` is lit on `/products` with no category.
- **Footer** (`mt-3xl border-t border-hairline bg-surface`): four columns — wordmark + one line; *Shop*: All products and the first three categories; *Your account*: Sign in, My orders, Request an account (→ `shopHref.signIn()` this phase; Phase 18 points it at `/checkout`); *Contact*: `SUPPLIER_PHONE`, `SUPPLIER_EMAIL`, `SUPPLIER_ADDRESS` — each row omitted when its variable is unset. Bottom rule: "© 2026 Loving Hands. All prices in Malaysian Ringgit." Stacks to two columns below `md`, one below `sm`.
- **Mobile top bar** below `md` replaces the header row: wordmark at `text-[length:var(--text-heading-md)]`… the canvas draws 22px; use `heading-md` (26px) — one step, recorded; account icon (guest → sign in; client → menu trigger) and cart icon with badge, both 44px targets; the search pill on its own row beneath; the category strip becomes a chip scroller (`h-control-sm rounded-pill border-hairline-strong`, active `bg-ink text-canvas`).
- **Mobile cart bar** (`MobileCartBar`, client): fixed to the bottom below `md`, `border-t border-hairline bg-canvas`, `env(safe-area-inset-bottom)` padding, shown only when the viewer's cart has lines: "3 products · 9 cartons" caption, the total in `text-[length:var(--text-body-md)] font-semibold tabular-nums` (guest: from `priced`, blank while pricing), and a *View cart* ink pill `h-12 rounded-pill flex-1`. `main` gets bottom padding equal to the bar so the last card is never hidden.

### 5.2 Home — `/`

`loadShopHome()` in `src/lib/queries/shop-home.ts`:

```ts
export type ShopHome = {
  categories: { name: string; count: number }[];        // SHOP_VISIBLE groupBy category, name asc
  bestSellers: ShopProduct[];                            // top 4 by LineItem quantity over twelveMonthWindow(), SHOP_VISIBLE; newest 4 when nothing has sold
  brands: { name: string; categories: string[] }[];      // distinct brand → its categories, for the tagline
};
```

Sections, page width, top to bottom: **hero** (`rounded-xxl bg-brand-gradient`, two columns from `lg`, `p-3xl`; eyebrow `font-mono uppercase text-canvas/80` — the canvas's one uppercase; `h1` `font-display text-[length:var(--text-display-2xl)] text-canvas` "Personal care, by the carton."; the paragraph; *Shop all products* white pill `h-control-lg rounded-pill bg-canvas text-ink` → `/products`; *Already a customer? Sign in* outlined `border-canvas/55 text-canvas` → `shopHref.signIn()` — hidden for a client; the three bottle silhouettes on the right are decorative SVG, `hidden lg:flex`) · **how it works** (three `rounded-lg border-hairline` cards with a 40px `rounded-md bg-surface-soft` icon well, copy verbatim from the artboard) · **Shop by category** (`h2 text-[length:var(--text-heading-md)]`, 4-up grid → 2-up below `md`; each a card linking to `/products?category=`, 64px `rounded-full bg-surface` circle holding the category's two-letter initials in `font-display text-focus`, the name, "{n} products") · **Best sellers** ("See all →" → `/products`; four `ShopProductCard`s; the first carries a *Best seller* badge `bg-ink text-canvas rounded-pill`) · **Our brands** (3-up `bg-surface` cards: brand in `heading-sm`, categories joined by ", " as the line under). Mobile: the hero is one column at `p-lg` with `display-md`, chips scroller above it, best sellers 2-up with the short *Add* label.

### 5.3 Catalogue — `/products`

**Query parsing** is pure and tested, in `src/lib/shop-filters.ts`:

```ts
export const SHOP_SORTS = ["name", "price-asc", "price-desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];
export const SHOP_PER_PAGE = 24;

export type ShopCatalogueQuery = {
  q: string | undefined;
  category: string | undefined;
  brands: string[];        // ?brand=ZEN%20GARDEN,MR.%20KING  (comma-joined)
  packSizes: number[];     // ?pack=6,12
  markets: string[];       // ?market=Malaysia,Vietnam
  sort: ShopSort;          // default "name"
  page: number;            // ≥ 1
};

export function parseShopQuery(params: SearchParams): ShopCatalogueQuery;
/** A new href with `over` applied. Any key other than page resets page. */
export function shopQueryHref(query: ShopCatalogueQuery, over: Partial<ShopCatalogueQuery>): string;
```

`listShopProducts` (`shop-catalogue.ts`) takes the parsed query, sorts on the underlying column (`name`, or `listPrice` asc/desc then name), pages by 24, and returns **facets** beside the products:

```ts
export type Facet<T extends string | number> = { value: T; count: number }[];
export type ShopCatalogue = {
  products: ShopProduct[];
  total: number;
  categories: string[];
  facets: { brands: Facet<string>; packSizes: Facet<number>; markets: Facet<string> };
};
```

Each facet's counts are computed with `prisma.product.groupBy` over the current `where` **minus that facet's own filter**, so a chip's numbers always answer "what would I get if I also ticked this" — the pattern the open Brand dropdown on the artboard draws (`ZEN GARDEN 31 · MR. KING 11 · L.HANDS 6`).

`ShopProduct` gains `market: string | null` (the card's second caption reads `12 per carton · Malaysia`).

**Screen**: breadcrumb `Home / {category or All products}` (caption, brand-link) · `h1` in `display-md` beside the result label `"48 products · showing 1–24"` (`text-ink-tertiary tabular-nums`; `"1 product"`; `"Nothing yet"` at zero) · the **filter bar** (`FilterBar`, client): a chip per facet — `h-control-md rounded-pill border-hairline-strong px-md` with label and chevron; when the facet has selections the chip turns `border-ink bg-surface font-semibold` and carries a count badge `bg-ink text-canvas rounded-pill`; clicking opens a `Popover` (`rounded-lg shadow-[indigo]`… use the existing `shadow-sm` tokened shadow) listing each value as a `Checkbox` row with its count on the right, applied on toggle through `useUrlNavigation().replace(shopQueryHref(...))`; a facet with no values renders no chip · a **Sort** chip on the right holding a `Select` (Name · Price, low to high · Price, high to low) · the **active-filter row** (`ActiveFilters`) when anything is set: caption "Filtered by", one pill per value (`h-control-sm rounded-pill border-brand-link`, label and an × icon, 44px hit area below `sm`), the search term shown as `“lavender”`, and *Clear all* → `/products` keeping only `category` · the **grid** of `ShopProductCard` (4-up ≥ `lg`, 3-up ≥ `md`, 2-up below) · `TablePagination` with `sizes={[24]}`.

**Empty state**: `rounded-lg border-hairline p-3xl text-center` — "Nothing matches that. Try a different search." and an outlined *Clear the filters*.

**Product card** (`ShopProductCard`, restyled): `rounded-lg border-hairline p-md flex flex-col`, hover `border-hairline-strong shadow-sm`; square `rounded-md bg-surface-soft` image via `ProductThumb`; name (`body-sm font-semibold`, `title`); `brand · variant` caption; `12 per carton · Malaysia` caption; price `body-md font-semibold tabular-nums` with "per carton" caption; **Add to cart** ink pill full width (`AddToCart variant="card"`), reading *In cart (n)* when the viewer's cart holds it. Below `sm` the label is *Add*.

> **The one exception to one-dark-pill-per-screen.** A catalogue grid carries an ink *Add to cart* on every card. That is the product's own primary action, the canvas draws it, and a grid of secondary buttons reads as a grid of nothing. Recorded here; everywhere else the master rule holds.

`AddToCart` (client): guest → `useGuestCart().add(productId, cartons)` and a toast; client → `addToCart` action, toast, `router.refresh()` so the badge and *In cart (n)* update. Both paths show the `Button pending` spinner while the action runs; the guest path resolves immediately.

### 5.4 Product — `/products/[id]`

Breadcrumb `Home / {category} / {name}` · two columns `lg:grid-cols-[5fr_7fr]` (the canvas draws a fixed 520px image column; 5fr of 1160 is 466px and holds the same shape; recorded) · **gallery**: `ProductGallery` with `canEdit={false}` — it already renders the large image `rounded-xl bg-surface-soft` with thumbnails; give its outer wrapper `self-start` (the 2026-09-09 stretched-grid-child lesson) · **details**: brand eyebrow `font-mono uppercase text-ink-tertiary` (canvas), `h1` `display-md`, the `sku · category · market` caption row with 1px `bg-hairline-strong` dividers · the **buy box** (`rounded-lg border-hairline p-lg`): price `font-display display-md tabular-nums` + "per carton"; the per-piece line `"RM 37.58 a piece · 6 per carton"` (`listPrice / packSize` through `Prisma.Decimal`, 2 dp; omitted when `packSize` is null); a 52px stepper (`CartonStepper` gains `size="lg"`: `h-control-lg` buttons and value, `rounded-pill` frame) with `"cartons = 18 pieces"` beside it and *Line total* on the right (`lineTotal(cartons, listPrice)`); *Add to cart* `h-control-lg rounded-pill` growing, *View cart* outlined beside it → `/cart`; the green tick line "No account needed to add to your cart — sign in when you send the order." (hidden for a client) · the **specs list** (`dl`, rows `py-sm border-b border-hairline`: Pack size, Unit, Brand, Variant, Market, Product code in `font-mono`; a null value prints `—`) · **About this product**: `description` when set, otherwise the section is omitted · **More from {brand}**: `relatedShopProducts(product)` — same brand and category, not itself, `SHOP_VISIBLE`, four by name; heading *You may also like* when the product has no brand; section omitted when empty. A product outside `SHOP_VISIBLE` stays a genuine 404 (`loadShopProduct` unchanged).

### 5.5 Cart — `/cart`

Both viewers get the same screen from the same components; only the data source differs. `h1` *Your cart*, caption `"{n} products · {c} cartons"`, and — when any line is unavailable — the second caption "One product is no longer on sale. It is shown so you can remove it, and it is left out of the total below." (`"{k} products are …"` above one).

- **`CartLines`** (client): a `rounded-lg border-hairline overflow-hidden` list with a `bg-surface` header row (Product · Cartons · Amount); each row `grid-cols-[88px_1fr_140px_120px_40px]` from `md` (stacked card below): 88px `rounded-md` thumbnail via `ProductThumb`, name linking to the product, `brand · variant · 12 per carton` caption, `RM 225.50 per carton · 18 pieces` caption, a 44px `CartonStepper` in a `rounded-pill` frame, the amount `body-md font-semibold tabular-nums`, a trash icon button (44px). An unavailable row: `bg-surface`, name in `ink-tertiary`, a `border-accent-red text-accent-red rounded-pill` *No longer available* chip, stepper at 45% opacity and disabled, amount `—`, trash in `accent-red`.
- **`OrderSummary`** (client): `rounded-lg border-hairline p-lg shadow-sm`, `heading-sm` *Order summary*; rows `"{n} products · {c} cartons"` / subtotal, *Delivery* / "Quoted by our team when they confirm your order" (caption, right-aligned, `max-w-[…]` → `max-w-panel-xs`), *Total* (`heading-sm` / `heading-md tabular-nums`); then the CTA and the footnote; *← Continue shopping* below a rule.
  - Guest: **Sign in to send this order** (`h-control-lg rounded-pill bg-ink`, lock icon) → `shopHref.signIn("/cart")` this phase (Phase 18 retargets it to `/checkout`); footnote "You're browsing as a guest. Your cart is kept on this device and moves to your account when you sign in."
  - Client, this phase only: the Phase 16 *Your reference* and *Notes* inputs and the **Send order** button move into this card unchanged in behaviour (`submitWebOrder`), disabled while any line is unavailable with "Remove the unavailable line first". Phase 18 replaces them with *Review and send*.
- **Empty**: `rounded-lg border-hairline p-3xl text-center` — "Your cart is empty." and a *Browse the catalogue* ink pill → `/products`.
- Guest data: `GuestCart` (client) reads `useGuestCart().priced`; shows a skeleton row per line until the first `priceCart` answers, so a reload never flashes an empty cart. Client data: the page loads `loadCart(user.id)` on the server exactly as today.

### 5.6 Mobile home — `Mobile.dc.html`

Covered by the responsive rules above. The canvas's purple count badge on the cart icon would be a flat `#7612fa` fill, which the design system forbids; it is `bg-ink` here, recorded as a deviation.

### 5.7 The account menu — `ShopAccountMenu`

`DropdownMenu` (the portal's `UserMenu` is the model). Trigger: 36px `PersonAvatar` and a chevron. Panel `w-[288px]` → `max-w-panel-xs` (18rem = 288px), `rounded-md border-hairline shadow-md p-xs`. Rows are `h-control-md` (the `mrow` on the canvas is 38px; 44 is the touch floor and the design system's `control-md`), `rounded-sm`, 17px icons → `size-4`.

Rows this phase: the **identity block** (40px avatar, name `body-sm font-semibold`, a 7px `bg-accent-green` dot and the buyer name in caption); separator; **My orders** → `/orders`; separator; **Talk to our team** → `mailto:${SUPPLIER_EMAIL}` with the external glyph, omitted when unset; separator; **Sign out** (`signOut({ callbackUrl: "/" })`). Later phases insert their rows in the canvas's order: 19 *Purchase orders*; 20 the boxed *Reorder your last order* lead and *Delivery updates*; 21 the *Your company* label with *Company details*, *Documents*, *Account settings*. The component takes `rows` so each phase adds one entry rather than editing markup.

## 6. Environment

`src/lib/env.ts` gains four **optional** keys through the existing `emptyAsUndefined`: `SUPPLIER_NAME`, `SUPPLIER_EMAIL` (`z.email()`), `SUPPLIER_PHONE`, `SUPPLIER_ADDRESS` (newlines as `\n`). `.env.example` documents them under a `# Storefront` heading. Nothing reads them but the footer and the menu this phase; Phase 19 prints them on the purchase order.

---

## 7. Tasks

### Task 1: Routes and the private-path list

**Files:**
- Modify: `src/lib/shop-routes.ts`
- Test: `src/lib/shop-routes.test.ts` (exists; extend)

**Interfaces:** Produces `shopHref.catalogue`, `shopHref.signIn`, `shopPath.catalogue`, `SHOP_PRIVATE_PATHS`, `isShopPrivatePath` exactly as in §1.

- [ ] **Step 1: Write the failing tests**

```ts
describe("shopHref.catalogue", () => {
  it("builds a browser-relative query and drops empty values", () => {
    expect(shopHref.catalogue({ category: "Hair care", brand: undefined, page: "2" }))
      .toBe("/products?category=Hair+care&page=2");
    expect(shopHref.catalogue()).toBe("/products");
  });
});
describe("isShopPrivatePath", () => {
  it("matches the path and its children only", () => {
    expect(isShopPrivatePath("/orders")).toBe(true);
    expect(isShopPrivatePath("/orders/abc")).toBe(true);
    expect(isShopPrivatePath("/ordersx")).toBe(false);
    expect(isShopPrivatePath("/products")).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/shop-routes.test.ts` — expect FAIL: `catalogue is not a function`.
- [ ] **Step 3: Implement** the §1 additions.
- [ ] **Step 4: Run** the file again — PASS.
- [ ] **Step 5: Commit** `feat(shop): catalogue and sign-in hrefs, and the private-path list`

### Task 2: Supplier details in the environment

**Files:** `src/lib/env.ts`, `.env.example`, `docs/specs/SETUP-CHECKLIST.md` (new §6.2 "Supplier details on the storefront").

- [ ] **Step 1:** Add the four optional keys (§6). `SUPPLIER_EMAIL: emptyAsUndefined(z.email())`, the others `emptyAsUndefined(z.string())`.
- [ ] **Step 2:** `.env.example`: a `# Storefront (Phase 17)` block with all four blank and a one-line comment each; note `SUPPLIER_ADDRESS` takes `\n`.
- [ ] **Step 3:** `npx tsc --noEmit` passes with the keys unset (they are optional).
- [ ] **Step 4: Commit** `chore(env): optional supplier details for the storefront`

### Task 3: The proxy lets guests into the shop

**Files:** `src/proxy.ts`

- [ ] **Step 1:** Import `isShopPrivatePath` from `@/lib/shop-routes`. In the `!session?.user` branch, before the redirect:

```ts
if (!session?.user) {
  if (isPublic) return NextResponse.next();
  // The shop is public. Only the account-shaped corners of it need a session,
  // and those are listed in one place (src/lib/shop-routes.ts).
  if (onShopHost && !isShared(pathname) && !isShopPrivatePath(pathname)) {
    return NextResponse.rewrite(
      new URL(`${SHOP_PREFIX}${pathname === "/" ? "" : pathname}${search}`, request.nextUrl),
    );
  }
  const signin = new URL("/signin", request.nextUrl);
  signin.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(signin);
}
```

Update the block comment at the top of the shop-host section to say the host is public unless private, and why the private list lives in `shop-routes.ts`.

- [ ] **Step 2: Verify on the wire** with `SHOP_HOST=shop.localhost` in `.env.local` and `npm run dev`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://shop.localhost:3000/            # 200
curl -s -o /dev/null -w '%{http_code}\n' http://shop.localhost:3000/products    # 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://shop.localhost:3000/orders   # 307 …/signin?next=%2Forders
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/shop             # 404 (portal host, unchanged)
```

(The home route 500s until Task 4 rewrites the layout; run this check again after Task 4. Record all four readings.)

- [ ] **Step 3: Commit** `feat(proxy): the shop host is public unless the path is private`

### Task 4: The viewer, the cart summary and the layout

**Files:**
- Create: `src/lib/shop-viewer.ts`, `src/components/shop/ShopViewer.tsx`
- Modify: `src/lib/queries/cart.ts` (add `cartSummary`, `priceProductLines`, `CartLine.imageUrl`), `src/lib/queries/shop-catalogue.ts` (export `thumbUrl`, add `listShopCategories`), `src/app/(storefront)/shop/layout.tsx`
- Test: `src/lib/shop-viewer.test.ts`, `src/lib/queries/cart.test.ts` (new)

**Interfaces:** Produces `loadShopViewer`, `ShopViewer`, `useShopViewer`, `cartSummary`, `priceProductLines`, `listShopCategories(): Promise<string[]>`.

- [ ] **Step 1: Failing tests.** `shop-viewer.test.ts` mocks `@/lib/auth-guards` and `@/lib/prisma`: no session → `GUEST`; a `MEMBER` → `"staff"`; a `CLIENT` whose row has `buyerId` and buyer → the client viewer with `buyerName`; a `CLIENT` whose fresh row has no buyer → `GUEST`. `cart.test.ts`: `priceProductLines` prices through `lineTotal`, marks `unavailable` for inactive / needsReview / zero price, excludes unavailable lines from `subtotal`, sorts by name then sku; `cartSummary` returns `count`, `cartonCount`, `subtotal` and the id/carton pairs.
- [ ] **Step 2:** Run both files — FAIL (modules missing).
- [ ] **Step 3: Implement.** `priceProductLines` is the body of today's `loadCart` map/filter/reduce lifted out; `loadCart` and `cartSummary` both call it. `ShopViewer.tsx`: `createContext<ShopViewer>(GUEST)`, `ShopViewerProvider({ viewer, children })`, `useShopViewer()`.
- [ ] **Step 4: Rewrite the layout:**

```tsx
export default async function StorefrontLayout({ children }) {
  const viewer = await loadShopViewer();
  if (viewer === "staff") redirect(env.APP_URL);   // same reason as today, comment kept
  const [categories, summary] = await Promise.all([
    listShopCategories(),
    viewer.kind === "client" ? cartSummary(viewer.id) : Promise.resolve(null),
  ]);
  return (
    <ShopViewerProvider viewer={viewer}>
      <GuestCartProvider>            {/* Task 5 */}
        <NavProgressProvider>
          <SkipLink />
          <ShopUtilityBar />
          <ShopHeader categories={categories} summary={summary} />   {/* Task 7 */}
          <main id="main" className="mx-auto w-full max-w-page px-md pb-3xl sm:px-lg md:pb-0">{children}</main>
          <ShopFooter categories={categories} />
          <MobileCartBar />
          <GuestCartMerge />         {/* Task 6 */}
        </NavProgressProvider>
      </GuestCartProvider>
      <Toaster />
    </ShopViewerProvider>
  );
}
```

Until Tasks 5–7 exist, render the old `ShopHeader` inline; the point of this task is that a guest gets a page, not a redirect. Every existing page keeps its own `requireClient()` for now (Tasks 8–11 rewrite them).

- [ ] **Step 5:** Tests PASS; `npx tsc --noEmit`; re-run the Task 3 curls — `/` is now 200 for a guest.
- [ ] **Step 6: Commit** `feat(shop): a viewer for the storefront — guest or client — and one cart summary`

### Task 5: The guest cart

**Files:**
- Create: `src/lib/guest-cart.ts`, `src/lib/guest-cart.test.ts`, `src/actions/shop-public.ts`, `src/actions/shop-public.test.ts`, `src/components/shop/GuestCartProvider.tsx`
- Modify: `src/lib/validation/cart.ts` (export `guestCartLinesSchema`)

**Interfaces:** Produces everything in §4 except `mergeGuestCart`.

- [ ] **Step 1: Failing tests** — `guest-cart.test.ts`:

```ts
it("parses nothing, junk and a wrong version as empty", () => {
  expect(parseGuestCart(null).lines).toEqual([]);
  expect(parseGuestCart("{not json").lines).toEqual([]);
  expect(parseGuestCart(JSON.stringify({ v: 2, lines: [{ productId: "a", cartons: 1 }] })).lines).toEqual([]);
});
it("clamps cartons, drops bad lines, dedupes ids and caps the line count", () => {
  const raw = JSON.stringify({ v: 1, lines: [
    { productId: "a", cartons: 0 }, { productId: "a", cartons: 3 },
    { productId: "b", cartons: 99999 }, { productId: "", cartons: 2 }, { productId: 7, cartons: 1 },
  ], updatedAt: "" });
  expect(parseGuestCart(raw).lines).toEqual([{ productId: "a", cartons: 3 }, { productId: "b", cartons: MAX_CARTONS_PER_LINE }]);
  const many = { v: 1, lines: Array.from({ length: 150 }, (_, i) => ({ productId: `p${i}`, cartons: 1 })), updatedAt: "" };
  expect(parseGuestCart(JSON.stringify(many)).lines).toHaveLength(MAX_GUEST_LINES);
});
it("add increments, set replaces and removes at zero", () => {
  let cart = addLine(EMPTY_GUEST_CART, "a", 2);
  cart = addLine(cart, "a", 3);
  expect(guestCountOf(cart, "a")).toBe(5);
  cart = setLine(cart, "a", 1);
  expect(guestCountOf(cart, "a")).toBe(1);
  cart = setLine(cart, "a", 0);
  expect(cart.lines).toEqual([]);
});
```

`shop-public.test.ts` (mock `@/lib/prisma`, **do not** mock auth — the action must not import it): `priceCart` drops an id the catalogue does not hold; returns `unavailable: true` for a product with `needsReview`; excludes it from `subtotal`; refuses 101 lines with an error; returns `EMPTY_CART` for `[]`.

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement** `guest-cart.ts` (pure), `guestCartLinesSchema = z.array(z.object({ productId: z.string().min(1).max(64), cartons: cartonsSchema })).max(MAX_GUEST_LINES)` in `validation/cart.ts`, and `priceCart`:

```ts
export async function priceCart(lines: GuestCartLine[]): Promise<ActionResult<Cart>> {
  const parsed = guestCartLinesSchema.safeParse(lines);
  if (!parsed.success) return { success: false, error: "That cart could not be read." };
  if (parsed.data.length === 0) return { success: true, data: EMPTY_CART };
  const products = await prisma.product.findMany({
    where: { id: { in: parsed.data.map((line) => line.productId) } },
    select: PRICED_PRODUCT_SELECT,   // exported from queries/cart.ts, the same select loadCart uses
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const rows = parsed.data.flatMap((line) => {
    const product = byId.get(line.productId);
    return product ? [{ productId: line.productId, cartons: line.cartons, product }] : [];
  });
  return { success: true, data: { id: null, ...priceProductLines(rows) } };
}
```

- [ ] **Step 4: The provider** per §4. `useEffect` on mount: `setCart(parseGuestCart(localStorage.getItem(GUEST_CART_KEY)))`, `setHydrated(true)`; a `storage` listener for the key; every mutator writes `localStorage.setItem` inside a `try` (private mode throws); a debounced effect on `cart.lines` calls `priceCart` and stores `priced`. For a client viewer the provider returns the context with `hydrated: true`, empty cart and no-op mutators. `useCartCount(productId)`: guest → `guestCountOf`; client → the `summary.lines` the header passes into a second small context (`CartSummaryProvider`, same file).
- [ ] **Step 5:** Tests PASS. Commit `feat(shop): a guest cart of product ids and cartons, priced live`

### Task 6: Merging the guest cart on sign-in

**Files:** `src/actions/cart.ts`, `src/actions/cart.test.ts`, `src/components/shop/GuestCartMerge.tsx`

- [ ] **Step 1: Failing tests** in `cart.test.ts`: `mergeGuestCart` refuses a guest (`requireClient` throws → `{ success: false }`); increments an existing line through `webOrderLine.upsert` with `update: { cartons: { increment } }`; skips an unavailable product and reports `skipped: 1`; an empty array returns `{ merged: 0, skipped: 0 }` without opening a cart.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3: Implement.** Lift the body of `addToCart` after validation into `async function upsertLine(cartId, productId, cartons)`; `addToCart` and `mergeGuestCart` both call it. `mergeGuestCart` validates with `guestCartLinesSchema`, calls `orderableProduct` per line (one `findMany` for all ids rather than one per line — reuse the select), upserts the orderable ones, `revalidateShop()`, returns the counts.
- [ ] **Step 4: `GuestCartMerge`** per §4 (ref-guarded effect, toast, `router.refresh()`).
- [ ] **Step 5:** PASS. Commit `feat(shop): a guest's cart moves into their account when they sign in`

### Task 7: The shell

**Files:**
- Create: `src/components/shop/ShopUtilityBar.tsx`, `src/components/shop/CategoryStrip.tsx`, `src/components/shop/CartBadge.tsx`, `src/components/shop/ShopAccountMenu.tsx`, `src/components/shop/ShopFooter.tsx`, `src/components/shop/MobileCartBar.tsx`, `src/components/shop/ShopSearch.tsx`
- Rewrite: `src/components/shop/ShopHeader.tsx`
- Modify: `src/app/(storefront)/shop/layout.tsx` (mount them)

- [ ] **Step 1:** Build each component to §5.1 and §5.7. `ShopHeader({ categories, summary })` renders the desktop row and the mobile row with `hidden md:flex` / `md:hidden`; the account control is `Sign in` link or `ShopAccountMenu` by `useShopViewer().kind`. `CartBadge` and `MobileCartBar` are client components reading `useGuestCart()` for a guest and the `CartSummaryProvider` for a client; a guest badge renders nothing until `hydrated`.
- [ ] **Step 2:** `npm run lint` and `npx tsc --noEmit` clean.
- [ ] **Step 3: Browser check** at 1440 and 390: the header row, strip and footer render for a guest and for a client (seed client: invite one from `/buyers/[id]` as super admin — record the email — and sign in on `shop.localhost:3000`); the cart badge shows the guest count after adding from Task 10, and the client count from `cartSummary`. Measure with `document.documentElement.scrollWidth === window.innerWidth` at both widths.
- [ ] **Step 4: Commit** `feat(shop): utility bar, header with search and cart, category strip, account menu, footer, mobile cart bar`

### Task 8: Home

**Files:**
- Create: `src/lib/queries/shop-home.ts`, `src/lib/queries/shop-home.test.ts`, `src/components/shop/home/Hero.tsx`, `HowItWorks.tsx`, `CategoryGrid.tsx`, `BestSellers.tsx`, `BrandCards.tsx`
- Rewrite: `src/app/(storefront)/shop/page.tsx`, `src/app/(storefront)/shop/loading.tsx` (skeleton from the `Skeletons` kit)

- [ ] **Step 1: Failing test** — `shop-home.test.ts` mocks prisma: `bestSellers` are ordered by summed quantity over the twelve-month window and filtered to `SHOP_VISIBLE`; when no line items exist the newest four visible products come back; `brands` carry sorted distinct categories.
- [ ] **Step 2:** FAIL. **Step 3:** Implement `loadShopHome` (§5.2): `groupBy category` with `_count`; `lineItem.groupBy({ by: ["productId"], where: { purchaseOrder: { poDate: { gte: from }, supersededBy: null }, product: SHOP_VISIBLE }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 4 })` then load those products in that order; brands via `findMany({ where: { ...SHOP_VISIBLE, brand: { not: null } }, distinct: ["brand", "category"], select: { brand, category } })` folded in memory.
- [ ] **Step 4:** Build the page and the five sections to §5.2. The page no longer calls `requireClient()`.
- [ ] **Step 5:** PASS; browser: `/` as a guest at 390/768/1440 — zero overflow, hero CTA links land, category counts equal `SELECT category, count(*) … WHERE active AND NOT "needsReview" AND "listPrice" > 0 GROUP BY 1` on the development database (record both).
- [ ] **Step 6: Commit** `feat(shop): the home page — hero, categories, best sellers, brands`

### Task 9: Catalogue with a filter bar

**Files:**
- Create: `src/lib/shop-filters.ts`, `src/lib/shop-filters.test.ts`, `src/components/shop/catalogue/FilterBar.tsx`, `ActiveFilters.tsx`, `SortSelect.tsx`, `src/app/(storefront)/shop/products/page.tsx`, `src/app/(storefront)/shop/products/loading.tsx`
- Modify: `src/lib/queries/shop-catalogue.ts` (facets, sort, `market`, `relatedShopProducts`), `src/lib/queries/shop-catalogue.test.ts` (new), `src/components/shop/ShopProductCard.tsx` (restyle, `AddToCart`)

- [ ] **Step 1: Failing tests.** `shop-filters.test.ts`:

```ts
it("parses comma-joined facets, a bounded page and a defaulted sort", () => {
  const q = parseShopQuery({ brand: "ZEN GARDEN,MR. KING", pack: "6,12,x", sort: "bogus", page: "0" });
  expect(q.brands).toEqual(["ZEN GARDEN", "MR. KING"]);
  expect(q.packSizes).toEqual([6, 12]);
  expect(q.sort).toBe("name");
  expect(q.page).toBe(1);
});
it("resets the page when anything but the page changes", () => {
  const q = parseShopQuery({ page: "3", category: "Hair care" });
  expect(shopQueryHref(q, { brands: ["L.HANDS"] })).toBe("/products?category=Hair+care&brand=L.HANDS");
  expect(shopQueryHref(q, { page: 4 })).toBe("/products?category=Hair+care&page=4");
});
```

`shop-catalogue.test.ts` (mock prisma): the products `where` carries `brand: { in }`, `packSize: { in }`, `market: { in }`; the brands facet `groupBy` `where` omits `brand` but keeps `packSize` and `market`; `sort: "price-desc"` produces `orderBy: [{ listPrice: "desc" }, { name: "asc" }]`.

- [ ] **Step 2:** FAIL. **Step 3:** Implement `shop-filters.ts`; extend `listShopProducts` per §5.3 (three `groupBy` calls in the same `Promise.all`; `packSize` facet drops nulls); add `relatedShopProducts`.
- [ ] **Step 4:** Build the page and components to §5.3. `FilterBar` uses `Popover` + `Checkbox` from `src/components/ui`; `SortSelect` uses `Select`; both write the URL through `useUrlNavigation`. The header's search form posts to this page.
- [ ] **Step 5:** PASS; browser at 1440: tick ZEN GARDEN and 12 per carton — the URL reads `?brand=ZEN+GARDEN&pack=12`, the result label and the row count agree (read the count from the database with the same filters), the chips show counts, the active row shows two pills and *Clear all*. At 390 the chips wrap and the grid is 2-up; zero overflow.
- [ ] **Step 6: Commit** `feat(shop): the catalogue — facet chips, active filters, sort, 24 a page`

### Task 10: Product page

**Files:** `src/app/(storefront)/shop/products/[id]/page.tsx` (rewrite), `src/components/shop/BuyBox.tsx` (client), `src/components/shop/AddToCart.tsx` (replaces `AddToOrder.tsx`), `src/components/shop/CartonStepper.tsx` (add `size`), `src/components/shop/ProductSpecs.tsx`

- [ ] **Step 1:** Build to §5.4. `BuyBox` holds the stepper state, the line total (`lineTotal`), *Add to cart* through `AddToCart` and *View cart*. Delete `AddToOrder.tsx` and update its two importers.
- [ ] **Step 2:** `npx tsc --noEmit`, lint.
- [ ] **Step 3:** Browser, guest: set 3 cartons on a 6-per-carton product — "cartons = 18 pieces", line total equals `3 × listPrice` to the cent; *Add to cart* → the header badge reads 1 and `localStorage["lh-shop-cart"]` holds `{"productId":…,"cartons":3}` and **no price field** (paste the stored JSON into the report). Reload — the badge survives. 390/768/1440 zero overflow; the gallery column measured narrower than the details column at 1440.
- [ ] **Step 4: Commit** `feat(shop): the product page — gallery, buy box, specs, more from the brand`

### Task 11: Cart for both viewers

**Files:** `src/app/(storefront)/shop/cart/page.tsx` (rewrite), `src/components/shop/cart/CartLines.tsx`, `OrderSummary.tsx`, `GuestCart.tsx`, `ClientCart.tsx`; delete `src/components/shop/CartTable.tsx`

- [ ] **Step 1:** Build to §5.5. `ClientCart` keeps the Phase 16 reference/notes/Send behaviour inside `OrderSummary` (props `sendSection`), so a client can still send an order this phase.
- [ ] **Step 2:** Browser, **the price proof** (the 2026-09-10 test, repeated for the guest cart): with a guest cart holding a product, change that product's list price in ops; reload `/cart` — the new price shows, the old one appears nowhere in `localStorage`, and the total recomputes. Record both figures.
- [ ] **Step 3: The merge proof.** Guest cart with 3 lines; sign in as the test client at `/signin` → toast "Your cart moved to your account"; `SELECT count(*) FROM "WebOrderLine" wl JOIN "WebOrder" wo ON wo.id = wl."webOrderId" WHERE wo."placedById" = '<id>' AND wo.status = 'DRAFT'` reads 3; `localStorage["lh-shop-cart"]` is gone. Add the same product twice as a guest and once as a client, merge — one line, cartons summed.
- [ ] **Step 4:** The unavailable state: mark a carted product `needsReview` in ops — the row shows the red chip, the total excludes it, *Send order* (client) is disabled.
- [ ] **Step 5: Commit** `feat(shop): the cart — lines, summary, unavailable lines, one screen for guests and clients`

### Task 12: Verification, cleanup and the history entry

- [ ] `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — all green; record the test count.
- [ ] The sweep: `/`, `/products`, `/products?category=…&brand=…`, `/products/[id]`, `/cart` (guest and client) × {390, 768, 1440} — zero horizontal overflow, no control under 44px on the phone.
- [ ] Status readings from Task 3 repeated on the finished branch.
- [ ] Ops journeys unchanged: sign in on the portal, upload, review, confirm, `/web-orders/[id]` confirm of a shop order.
- [ ] Remove test data: the invited client, its `DRAFT` `WebOrder` and lines, any price edits reverted, `needsReview` restored; counts back to what they were before the branch (record before/after).
- [ ] `context/current-feature.md`: status and the history entry per the overview's convention.

## 8. Acceptance criteria

1. With no session, `/`, `/products`, a product page and `/cart` on the shop host all return 200 and render; `/orders` redirects to `/signin?next=/orders`; `/shop` on the portal host is a genuine 404. Read from the wire.
2. A guest adds three products by the carton; the badge, the cart rows, the summary and the mobile bar agree; the stored JSON carries ids and cartons and no price.
3. A price changed in ops between adding and viewing is the price shown, and the old one exists nowhere in the browser.
4. Signing in merges the guest cart into the account's `DRAFT` `WebOrder` — proven by a row count — and empties the browser copy; a product in both carts becomes one line.
5. Filters compose (category + two brands + a pack size), the URL carries every one, the result label equals the row count, facet counts equal a database `GROUP BY` with the same other filters.
6. An unavailable line is shown, marked, excluded from the total and blocks sending.
7. A member on the shop host is still redirected to the portal; a client on the portal host to the shop.
8. Every existing ops journey is unchanged.
9. Zero horizontal overflow at 390, 768 and 1440 on every route above.

## 9. Out of scope

- **The checkout gate, review & send, order sent** — Phase 18. This phase's guest CTA goes to the shared `/signin`.
- **Size and Price facets** (overview assumption).
- **Order history, the PO document, settings, product codes** — 19–22.
- **Preview the shop as a member** — still the half-state 15 §3.2 removed.
- **A guest cart older than the browser** — no server-side guest carts, no cookies. Clearing site data clears the basket, and the cart says so.
