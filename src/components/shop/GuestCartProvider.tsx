"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { priceCart } from "@/actions/shop-public";
import {
  EMPTY_GUEST_CART,
  GUEST_CART_KEY,
  addLine,
  guestCountOf,
  parseGuestCart,
  removeLine,
  setLine,
  type GuestCart,
} from "@/lib/guest-cart";
import type { Cart, CartSummary } from "@/lib/queries/cart";
import { useShopViewer } from "@/components/shop/ShopViewer";

export type GuestCartApi = {
  hydrated: boolean;
  cart: GuestCart;
  /** Today's priced figures for `cart`. Null until the first `priceCart` answers. */
  priced: Cart | null;
  pricing: boolean;
  /** True when the most recent `priceCart` rejected or answered `{success:false}`. */
  pricingFailed: boolean;
  /** Re-runs `priceCart` immediately, bypassing the debounce. */
  retryPricing: () => void;
  add: (productId: string, cartons: number) => void;
  set: (productId: string, cartons: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

/**
 * What a signed-in client gets: a client has a real `WebOrder` cart on the
 * server, not a `localStorage` one, so every guest-cart operation here is a
 * no-op and nothing is ever read from or written to storage.
 */
const INERT_GUEST_CART: GuestCartApi = {
  hydrated: true,
  cart: EMPTY_GUEST_CART,
  priced: null,
  pricing: false,
  pricingFailed: false,
  retryPricing: () => {},
  add: () => {},
  set: () => {},
  remove: () => {},
  clear: () => {},
};

const GuestCartContext = createContext<GuestCartApi>(INERT_GUEST_CART);

/** A fast run of stepper clicks prices once, this long after they stop. */
const PRICE_DEBOUNCE_MS = 300;

/**
 * Holds a guest's cart in `localStorage` and keeps it priced against the live
 * catalogue. Mounted once in the shop layout, above every page.
 *
 * `localStorage` is read only after mount (`useEffect`, never during render),
 * so server and first-paint client markup always agree — a guest and a
 * signed-in browser render the identical empty shell before hydration.
 */
export function GuestCartProvider({ children }: { children: ReactNode }) {
  const viewer = useShopViewer();
  const isClient = viewer.kind === "client";

  const [cart, setCart] = useState<GuestCart>(EMPTY_GUEST_CART);
  const [hydrated, setHydrated] = useState(false);
  const [priced, setPriced] = useState<Cart | null>(null);
  const [pricing, setPricing] = useState(false);
  const [pricingFailed, setPricingFailed] = useState(false);
  // A monotonic id, not a boolean "cancelled" flag, so a manual `retryPricing`
  // call and the debounced effect's own call can each supersede the other:
  // whichever `priceCart` answers last wins, and a superseded one is not
  // allowed to write stale state over it.
  const priceRequestRef = useRef(0);

  useEffect(() => {
    // The state write is inside a nested callback, never a bare statement in
    // the effect body — the same shape `useCountUp`'s rAF tick and
    // `useEdgeFades`' ResizeObserver callback use elsewhere in this codebase,
    // so a synchronous read-then-setState effect does not cascade renders.
    const timer = setTimeout(() => {
      if (isClient) {
        setHydrated(true);
        return;
      }
      try {
        setCart(parseGuestCart(localStorage.getItem(GUEST_CART_KEY)));
      } catch {
        // Private browsing, or storage disabled: fall back to an in-memory
        // cart for the rest of this tab's session rather than breaking it.
      }
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isClient]);

  // Two tabs agree: a write in one tab is a `storage` event in the other.
  useEffect(() => {
    if (isClient) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== GUEST_CART_KEY) return;
      setCart(parseGuestCart(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isClient]);

  // Takes an updater rather than a computed `GuestCart` so two mutator calls
  // inside the same synchronous handler each compose on the *other's*
  // result instead of both reading the same stale `cart` from the last
  // completed render and only the last `setCart` surviving.
  const persist = useCallback(
    (updater: (prev: GuestCart) => GuestCart) => {
      setCart((prev) => {
        const next = updater(prev);
        if (!isClient) {
          try {
            localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next));
          } catch {
            // Private browsing, or storage disabled: the mutation still
            // lands in state, so this tab keeps working; it just will not
            // survive a reload.
          }
        }
        return next;
      });
    },
    [isClient],
  );

  const add = useCallback(
    (productId: string, cartons: number) =>
      persist((prev) => addLine(prev, productId, cartons)),
    [persist],
  );
  const set = useCallback(
    (productId: string, cartons: number) =>
      persist((prev) => setLine(prev, productId, cartons)),
    [persist],
  );
  const remove = useCallback(
    (productId: string) => persist((prev) => removeLine(prev, productId)),
    [persist],
  );
  const clear = useCallback(() => persist(() => EMPTY_GUEST_CART), [persist]);

  // The actual pricing call, shared by the debounced effect below and by
  // `retryPricing` — the only difference between "add a line" and "click Try
  // again" is when this runs, never how.
  const priceNow = useCallback((lines: GuestCart["lines"]) => {
    const requestId = ++priceRequestRef.current;
    setPricing(true);
    return priceCart(lines)
      .then((result) => {
        if (priceRequestRef.current !== requestId) return; // superseded
        if (result.success) {
          setPriced(result.data);
          setPricingFailed(false);
        } else {
          // `priced` is left as it was: a stale figure beats a blank cart
          // over a transient failure the guest did nothing to cause. The
          // failure is still recorded, though, so a *first* pricing that
          // never had a `priced` value to fall back on can show an error
          // instead of shimmering forever.
          console.error("[guest-cart] priceCart failed:", result.error);
          setPricingFailed(true);
        }
      })
      .catch((cause: unknown) => {
        if (priceRequestRef.current !== requestId) return;
        console.error("[guest-cart] priceCart threw:", cause);
        setPricingFailed(true);
      })
      .finally(() => {
        if (priceRequestRef.current === requestId) setPricing(false);
      });
  }, []);

  // Debounced live pricing. Runs once hydrated (so it never fires against the
  // placeholder empty cart before storage is read) and on every subsequent
  // change to the lines, including down to zero — `priceCart([])` answers
  // `EMPTY_CART` cheaply, without a query, so there is no special case here.
  useEffect(() => {
    if (isClient || !hydrated) return;
    const timer = setTimeout(() => {
      void priceNow(cart.lines);
    }, PRICE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cart.lines, isClient, hydrated, priceNow]);

  const retryPricing = useCallback(() => {
    void priceNow(cart.lines);
  }, [priceNow, cart.lines]);

  if (isClient) {
    return (
      <GuestCartContext.Provider value={INERT_GUEST_CART}>
        {children}
      </GuestCartContext.Provider>
    );
  }

  return (
    <GuestCartContext.Provider
      value={{ hydrated, cart, priced, pricing, pricingFailed, retryPricing, add, set, remove, clear }}
    >
      {children}
    </GuestCartContext.Provider>
  );
}

export function useGuestCart(): GuestCartApi {
  return useContext(GuestCartContext);
}

const CartSummaryContext = createContext<CartSummary | null>(null);

/**
 * Holds the client's server-loaded `CartSummary` (Task 7's header reads it),
 * kept separate from `GuestCartContext` because a client's cart lives on the
 * server, not in this tab's `localStorage`.
 */
export function CartSummaryProvider({
  summary,
  children,
}: {
  summary: CartSummary | null;
  children: ReactNode;
}) {
  return (
    <CartSummaryContext.Provider value={summary}>{children}</CartSummaryContext.Provider>
  );
}

export function useCartSummary(): CartSummary | null {
  return useContext(CartSummaryContext);
}

/**
 * Cartons of one product in whichever cart the viewer has: a guest's own
 * `localStorage` cart, or a signed-in client's server-loaded summary.
 */
export function useCartCount(productId: string): number {
  const viewer = useShopViewer();
  const guest = useGuestCart();
  const summary = useCartSummary();

  if (viewer.kind === "client") {
    return summary?.lines.find((line) => line.productId === productId)?.cartons ?? 0;
  }
  return guestCountOf(guest.cart, productId);
}
