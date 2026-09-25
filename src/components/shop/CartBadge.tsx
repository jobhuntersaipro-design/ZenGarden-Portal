"use client";

import { useEffect, useState } from "react";
import { cn } from "cn";
import { onCartAdded } from "@/components/shop/cart-events";
import { useCartSummary, useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";
import type { CartSummary } from "@/lib/queries/cart";

/**
 * The line count on the Cart pill (desktop) and the mobile cart icon.
 *
 * A guest badge renders nothing until the localStorage cart has hydrated —
 * before then a returning guest with lines already saved would flash "no
 * badge" first. `summary` lets `ShopHeader` forward the server-loaded prop
 * it already has for a client; omitted, this falls back to
 * `CartSummaryProvider`'s context so the badge works anywhere else in the
 * tree (e.g. `MobileCartBar`'s sibling icon, mounted outside `ShopHeader`).
 */
export function CartBadge({
  summary: summaryProp,
  variant = "pill",
}: {
  summary?: CartSummary | null;
  variant?: "pill" | "mobile";
}) {
  const viewer = useShopViewer();
  const guest = useGuestCart();
  const contextSummary = useCartSummary();
  const summary = summaryProp !== undefined ? summaryProp : contextSummary;
  // Bumped on every add, so the badge pops even when its number is the same.
  // Keyed on the element, which restarts the animation; zero on first paint,
  // so a page load does not pop.
  const [bumps, setBumps] = useState(0);
  useEffect(() => onCartAdded(() => setBumps((n) => n + 1)), []);

  const count =
    viewer.kind === "client"
      ? (summary?.count ?? 0)
      : guest.hydrated
        ? guest.cart.lines.length
        : null;

  if (!count) return null;

  return (
    <>
      <span
        key={bumps}
        aria-hidden
        className={cn(
          "flex h-5 min-w-5 items-center justify-center rounded-pill px-xxs text-[length:var(--text-caption)] font-semibold tabular-nums",
          bumps > 0 && "animate-count-pop",
          variant === "mobile"
            ? "absolute top-xxs right-xxs bg-ink text-canvas"
            : "bg-canvas text-ink",
        )}
      >
        {count}
      </span>
      {/* The digit above is `aria-hidden` — this is what gives the
          surrounding "Cart" link/button its count for a screen reader. */}
      <span className="sr-only">
        {`, ${count} product${count === 1 ? "" : "s"} in your cart`}
      </span>
    </>
  );
}
