"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { mergeGuestCart } from "@/actions/cart";
import { useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { GUEST_CART_KEY, parseGuestCart } from "@/lib/guest-cart";

/**
 * Moves a guest's `localStorage` cart into their account the moment they
 * become a signed-in client — covering every way of signing in (password,
 * Google, an invite) without touching any auth code, because this only ever
 * reacts to `useShopViewer()` changing.
 *
 * Mounted once in the storefront layout, renders nothing. `useGuestCart()`
 * here is the client viewer's inert shape (see `GuestCartProvider`), so the
 * stored cart is read from `localStorage` directly rather than through it —
 * only `clear()` is used, to reset this tab's in-memory guest cart (and any
 * badge reading it) once the merge lands, since a same-tab `localStorage`
 * write fires no `storage` event for the provider's listener to catch.
 *
 * The ref guard is what makes this safe under React's double-invoked mount
 * effect (dev-only, StrictMode): without it, the second invocation would
 * merge the same lines twice.
 */
export function GuestCartMerge() {
  const viewer = useShopViewer();
  const { clear } = useGuestCart();
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (viewer.kind !== "client") return;
    if (ran.current) return;
    ran.current = true;

    let stored: string | null;
    try {
      stored = localStorage.getItem(GUEST_CART_KEY);
    } catch {
      // Private browsing, or storage disabled: nothing to merge.
      return;
    }
    const { lines } = parseGuestCart(stored);
    if (lines.length === 0) return;

    void mergeGuestCart(lines).then((result) => {
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      try {
        localStorage.removeItem(GUEST_CART_KEY);
      } catch {
        // Private browsing, or storage disabled: nothing was persisted there
        // to begin with.
      }
      clear();

      const { skipped } = result.data;
      const suffix =
        skipped > 0
          ? ` — ${skipped} ${skipped === 1 ? "line is" : "lines are"} no longer available`
          : "";
      toast.success(`Your cart moved to your account${suffix}`);
      router.refresh();
    }).catch((cause: unknown) => {
      // A rejected promise (offline, a deploy mid-flight, an aborted POST) is
      // not the same as `{success:false}` above — without this, it is an
      // unhandled rejection and `ran.current` is already `true`, so nothing
      // retries until the component remounts. Resetting the guard lets the
      // next render of this effect (e.g. a manual retry, or navigating away
      // and back) try again instead of leaving the cart stuck unmerged.
      console.error("[shop] GuestCartMerge", cause);
      ran.current = false;
      toast.error("We couldn't move your cart. Try again.");
    });
  }, [viewer.kind, clear, router]);

  return null;
}
