/**
 * The storefront lives at real paths under `/shop`, and the shop host rewrites
 * `/x` to `/shop/x` in `src/proxy.ts`. A route group cannot vary by host, and a
 * second `page.tsx` at `/` would not build — hence the prefix.
 *
 * That leaves two opposite rules, which is exactly why neither may be
 * hand-written:
 *
 * - Every `<Link>` in storefront code is **browser-relative** — `/cart`, never
 *   `/shop/cart`, or a client on the shop host lands on `/shop/shop/cart`.
 * - Every `revalidatePath` in a storefront Server Action names the **real**
 *   path — `/shop/cart` — because revalidation keys on the resolved route, not
 *   on the URL the browser asked for.
 */
export const SHOP_ROUTE_PREFIX = "/shop";

/** What a client's browser sees. Use for every href inside the storefront. */
export const shopHref = {
  home: () => "/",
  /** `/products?category=…&brand=a,b&page=2`. Empty values are dropped. */
  catalogue: (params: Record<string, string | undefined> = {}) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value) search.set(key, value);
    const query = search.toString();
    return query ? `/products?${query}` : "/products";
  },
  product: (id: string) => `/products/${id}`,
  cart: () => "/cart",
  /** Review and send — where an order is actually placed from (Phase 32). */
  checkoutReview: () => "/checkout/review",
  /** Keyed by the order's own reference, not its id: it is what the client
   * was just shown, and it is what they will quote on the phone. */
  orderSent: (reference: string) => `/checkout/sent/${encodeURIComponent(reference)}`,
  orders: () => "/orders",
  order: (id: string) => `/orders/${id}`,
  /** The shared sign-in card; `next` is a browser-relative path. */
  signIn: (next?: string) =>
    next ? `/signin?next=${encodeURIComponent(next)}` : "/signin",
} as const;

/** What Next resolved. Use for every `revalidatePath` in storefront actions. */
export const shopPath = {
  home: () => SHOP_ROUTE_PREFIX,
  catalogue: () => `${SHOP_ROUTE_PREFIX}/products`,
  product: (id: string) => `${SHOP_ROUTE_PREFIX}/products/${id}`,
  cart: () => `${SHOP_ROUTE_PREFIX}/cart`,
  checkoutReview: () => `${SHOP_ROUTE_PREFIX}/checkout/review`,
  orders: () => `${SHOP_ROUTE_PREFIX}/orders`,
  order: (id: string) => `${SHOP_ROUTE_PREFIX}/orders/${id}`,
} as const;

/**
 * Shop-host paths that need a client session. Everything else on the shop
 * host is public. `/checkout` covers both `/checkout/review` and
 * `/checkout/sent/…`: neither means anything without a cart and a buyer, and
 * the gate at `/checkout` itself is not built (that half of the Phase 18
 * spec is deliberately out of Phase 32's scope). Later phases append here
 * (19: /purchase-orders; 21: /settings) and nowhere else.
 */
export const SHOP_PRIVATE_PATHS = ["/orders", "/checkout"] as const;

export const isShopPrivatePath = (pathname: string) =>
  SHOP_PRIVATE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
