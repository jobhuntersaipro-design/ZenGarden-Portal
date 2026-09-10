import { ClientCart } from "@/components/shop/cart/ClientCart";
import { GuestCart } from "@/components/shop/cart/GuestCart";
import { loadCart } from "@/lib/queries/cart";
import { loadShopViewer } from "@/lib/shop-viewer";

export const dynamic = "force-dynamic";

/**
 * Both viewers land on this page; only the data source differs (§5.5). A
 * client's cart is a `WebOrder` read server-side here, a guest's lives in
 * `localStorage` and is read by `GuestCart` itself — this component never
 * fetches a guest's cart.
 */
export default async function CartPage() {
  const viewer = await loadShopViewer();
  // Unreachable in practice: the storefront layout already redirects staff
  // to the portal before any page under it renders. Narrowed here only so
  // `viewer.kind` below is typed as guest | client.
  if (viewer === "staff") return null;

  if (viewer.kind === "client") {
    const cart = await loadCart(viewer.id);
    return <ClientCart cart={cart} />;
  }

  return <GuestCart />;
}
