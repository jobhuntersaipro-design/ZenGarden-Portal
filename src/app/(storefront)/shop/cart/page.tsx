import type { Metadata } from "next";
import { ClientCart } from "@/components/shop/cart/ClientCart";
import { GuestCart } from "@/components/shop/cart/GuestCart";
import { loadCart } from "@/lib/queries/cart";
import { loadShopViewer } from "@/lib/shop-viewer";
import { withLoadingFloor } from "@/lib/loading-floor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your cart · Zen Garden" };

/**
 * Both viewers land on this page; only the data source differs (§5.5). A
 * client's cart is a `WebOrder` read server-side here, a guest's lives in
 * `localStorage` and is read by `GuestCart` itself — this component never
 * fetches a guest's cart.
 */
async function CartPage() {
  const viewer = await loadShopViewer();
  // Unreachable in practice: the storefront layout already redirects staff
  // to the portal before any page under it renders. Narrowed here only so
  // `viewer.kind` below is typed as guest | client.
  if (viewer === "staff") return null;

  if (viewer.kind === "client") {
    // The market is passed, not looked up: a line whose product has left it
    // prices at 0.00 and reads "No longer available", the same as one that
    // was archived — so an open cart cannot quote for something the buyer
    // may no longer order.
    const cart = await loadCart(viewer.id, viewer.market);
    return <ClientCart cart={cart} />;
  }

  // Unreachable since 2026-09-23: a guest is redirected to sign-in by the
  // proxy and again by the storefront layout, so there is no guest cart to
  // draw. Kept rather than deleted, with `GuestCart` and its localStorage
  // module, because reversing the sign-in requirement should not mean
  // rebuilding them.
  return <GuestCart />;
}

export default withLoadingFloor(CartPage);
