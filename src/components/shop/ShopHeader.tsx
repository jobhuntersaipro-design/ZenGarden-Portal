import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { Wordmark } from "@/components/portal/Wordmark";
import { shopHref } from "@/lib/shop-routes";

/**
 * Every href here is browser-relative — `/cart`, never `/shop/cart`. The shop
 * host rewrites `/x` to `/shop/x`, so a prefixed link would land the client on
 * `/shop/shop/cart`. src/lib/shop-routes.ts is the only place either form is
 * written.
 */
export function ShopHeader({
  buyerName,
  cartCount,
}: {
  buyerName: string;
  cartCount: number;
}) {
  return (
    <header className="mb-lg flex flex-wrap items-center justify-between gap-sm border-b border-hairline pb-md">
      <div className="min-w-0">
        <Link
          href={shopHref.home()}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Wordmark />
        </Link>
        <p className="mt-xxs truncate text-[length:var(--text-caption)] text-ink-tertiary">
          {buyerName}
        </p>
      </div>
      <nav className="flex items-center gap-md">
        <Link
          href={shopHref.orders()}
          className="min-h-control-md rounded-sm px-xs py-xxs text-[length:var(--text-body-sm)] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
        >
          My orders
        </Link>
        <Link
          href={shopHref.cart()}
          className="flex min-h-control-md items-center gap-xxs rounded-sm px-xs py-xxs text-[length:var(--text-body-sm)] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
        >
          <ShoppingCart className="size-4" aria-hidden />
          <span>Order</span>
          {cartCount > 0 ? (
            <span
              className="rounded-full bg-ink px-xxs text-[length:var(--text-caption)] tabular-nums text-canvas"
              aria-label={`${cartCount} lines in your order`}
            >
              {cartCount}
            </span>
          ) : null}
        </Link>
      </nav>
    </header>
  );
}
