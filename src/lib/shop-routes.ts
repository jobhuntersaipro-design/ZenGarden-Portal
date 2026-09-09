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
  product: (id: string) => `/products/${id}`,
  cart: () => "/cart",
  orders: () => "/orders",
  order: (id: string) => `/orders/${id}`,
} as const;

/** What Next resolved. Use for every `revalidatePath` in storefront actions. */
export const shopPath = {
  home: () => SHOP_ROUTE_PREFIX,
  product: (id: string) => `${SHOP_ROUTE_PREFIX}/products/${id}`,
  cart: () => `${SHOP_ROUTE_PREFIX}/cart`,
  orders: () => `${SHOP_ROUTE_PREFIX}/orders`,
  order: (id: string) => `${SHOP_ROUTE_PREFIX}/orders/${id}`,
} as const;
