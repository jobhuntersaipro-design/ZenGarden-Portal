"use client";

import Link from "next/link";
import { List, LogOut, Mail, ShoppingCart, User } from "lucide-react";
import { signOut } from "next-auth/react";
import { Wordmark } from "@/components/portal/Wordmark";
import { CartBadge } from "@/components/shop/CartBadge";
import { CategoryStrip } from "@/components/shop/CategoryStrip";
import { ShopAccountMenu, type ShopAccountMenuRow } from "@/components/shop/ShopAccountMenu";
import { ShopSearch } from "@/components/shop/ShopSearch";
import { useShopViewer } from "@/components/shop/ShopViewer";
import type { CartSummary } from "@/lib/queries/cart";
import { shopHref } from "@/lib/shop-routes";

/**
 * Every href here is browser-relative — `/cart`, never `/shop/cart`. The shop
 * host rewrites `/x` to `/shop/x`, so a prefixed link would land the client on
 * `/shop/shop/cart`. src/lib/shop-routes.ts is the only place either form is
 * written.
 *
 * `useShopViewer()` decides Sign in vs. the account menu; `client` component
 * for that reason alone — everything else here (categories, the cart
 * summary, the supplier's contact address) is data the server already loaded
 * and hands down as props.
 */
const accountRows = (supplierEmail: string | null): ShopAccountMenuRow[] => [
  { key: "orders", label: "My orders", icon: List, href: shopHref.orders() },
  { key: "sep-orders", separator: true },
  ...(supplierEmail
    ? ([
        {
          key: "contact",
          label: "Talk to our team",
          icon: Mail,
          href: `mailto:${supplierEmail}`,
          external: true,
        },
        { key: "sep-contact", separator: true },
      ] satisfies ShopAccountMenuRow[])
    : []),
  {
    key: "sign-out",
    label: "Sign out",
    icon: LogOut,
    onSelect: () => void signOut({ callbackUrl: "/" }),
  },
];

export function ShopHeader({
  categories,
  summary,
  supplierEmail,
}: {
  categories: string[];
  summary: CartSummary | null;
  supplierEmail: string | null;
}) {
  const viewer = useShopViewer();
  const rows = viewer.kind === "client" ? accountRows(supplierEmail) : [];

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
      {/* Desktop row */}
      <div className="mx-auto hidden max-w-page items-center gap-lg px-md py-md sm:px-lg md:flex">
        <Link
          href={shopHref.home()}
          className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Wordmark />
        </Link>

        <ShopSearch className="min-w-0 flex-1" />

        <div className="flex shrink-0 items-center gap-md whitespace-nowrap">
          <Link
            href={shopHref.cart()}
            className="flex h-control-md items-center gap-xs rounded-pill bg-ink px-md text-[length:var(--text-body-sm)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ShoppingCart className="size-4" aria-hidden />
            <span>Cart</span>
            <CartBadge summary={summary} />
          </Link>

          {viewer.kind === "client" ? (
            <ShopAccountMenu
              name={viewer.name}
              email={viewer.email}
              image={viewer.image}
              buyerName={viewer.buyerName}
              rows={rows}
            />
          ) : (
            <Link
              href={shopHref.signIn()}
              className="rounded-sm text-[length:var(--text-body-sm)] font-medium text-brand-link hover:text-brand-pink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <div className="mx-auto hidden max-w-page px-md pb-xs sm:px-lg md:block">
        <CategoryStrip categories={categories} variant="nav" />
      </div>

      {/* Mobile row */}
      <div className="flex items-center justify-between gap-xs px-md py-xs md:hidden">
        <Link
          href={shopHref.home()}
          className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Wordmark />
        </Link>

        <div className="flex items-center gap-xxs">
          {viewer.kind === "client" ? (
            <ShopAccountMenu
              name={viewer.name}
              email={viewer.email}
              image={viewer.image}
              buyerName={viewer.buyerName}
              rows={rows}
            />
          ) : (
            <Link
              href={shopHref.signIn()}
              aria-label="Sign in"
              className="flex size-11 items-center justify-center rounded-full text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
            >
              <User className="size-5" aria-hidden />
            </Link>
          )}
          <Link
            href={shopHref.cart()}
            className="relative flex size-11 items-center justify-center rounded-full text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
          >
            {/* No `aria-label` here: it would hide `CartBadge`'s own
                sr-only count from the accessible name, since aria-label
                replaces content instead of joining it. */}
            <span className="sr-only">Cart</span>
            <ShoppingCart className="size-5" aria-hidden />
            <CartBadge summary={summary} variant="mobile" />
          </Link>
        </div>
      </div>

      <div className="px-md pb-sm md:hidden">
        <ShopSearch />
      </div>

      <div className="overflow-x-auto px-md pb-sm md:hidden">
        <CategoryStrip categories={categories} variant="chips" />
      </div>
    </header>
  );
}
