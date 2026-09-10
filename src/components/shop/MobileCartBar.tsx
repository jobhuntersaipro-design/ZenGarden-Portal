"use client";

import Link from "next/link";
import { useCartSummary, useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { guestCartonCount } from "@/lib/guest-cart";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";

/**
 * Fixed to the bottom below `md`, shown only once the viewer's cart actually
 * has lines. A guest's line count comes from `useGuestCart()` and only after
 * `hydrated` — before then a returning guest's real cart would flash "empty"
 * first; a client's comes from `CartSummaryProvider`, loaded on the server.
 *
 * The total is blank (not "RM 0.00") while a guest's cart is still pricing —
 * `priced` starts `null` and a fresh debounce clears it to null on every
 * change, so a blank total beats a wrong one for the half-second it takes.
 */
export function MobileCartBar() {
  const viewer = useShopViewer();
  const guest = useGuestCart();
  const summary = useCartSummary();
  const isClient = viewer.kind === "client";

  const productCount = isClient ? (summary?.count ?? 0) : guest.cart.lines.length;
  const visible = isClient ? productCount > 0 : guest.hydrated && productCount > 0;

  if (!visible) return null;

  const cartonCount = isClient ? (summary?.cartonCount ?? 0) : guestCartonCount(guest.cart);
  const totalLabel = isClient
    ? formatMYR(summary?.subtotal ?? "0.00")
    : guest.priced
      ? formatMYR(guest.priced.subtotal)
      : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-sm border-t border-hairline bg-canvas px-md pt-xs md:hidden"
      style={{ paddingBottom: "calc(var(--spacing-sm) + env(safe-area-inset-bottom))" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {`${productCount} product${productCount === 1 ? "" : "s"} · ${cartonCount} carton${cartonCount === 1 ? "" : "s"}`}
        </p>
        <p className="text-[length:var(--text-body-md)] font-semibold tabular-nums text-ink">
          {totalLabel ?? " "}
        </p>
      </div>
      <Link
        href={shopHref.cart()}
        className="flex h-12 flex-1 items-center justify-center rounded-pill bg-ink text-[length:var(--text-body-sm)] font-semibold text-canvas hover:bg-ink-deep"
      >
        View cart
      </Link>
    </div>
  );
}
