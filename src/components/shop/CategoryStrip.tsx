"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { shopHref } from "@/lib/shop-routes";

/**
 * `All products` plus every category the shop actually carries. Two visual
 * shapes share one active-state rule (§5.1): `"nav"` is the desktop
 * underlined row under the header, `"chips"` is the mobile pill scroller —
 * both read the same `usePathname`/`useSearchParams`, so they cannot
 * disagree about what is active.
 *
 * Active is `/products` only: with no `?category=` it is `All products`;
 * with one, that category; on any other route (home, a product page, the
 * cart) nothing is lit.
 */
export function CategoryStrip({
  categories,
  variant = "nav",
}: {
  categories: string[];
  variant?: "nav" | "chips";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onCatalogue = pathname === "/products";
  const activeCategory = onCatalogue ? searchParams.get("category") : undefined;

  const items: { key: string; label: string; category?: string }[] = [
    { key: "__all__", label: "All products" },
    ...categories.map((category) => ({ key: category, label: category, category })),
  ];

  return (
    <nav
      aria-label="Shop by category"
      className={cn(
        "flex items-center overflow-x-auto",
        variant === "nav" ? "gap-lg" : "gap-xs",
      )}
    >
      {items.map(({ key, label, category }) => {
        const active = onCatalogue && (category ?? null) === activeCategory;
        return (
          <Link
            key={key}
            href={shopHref.catalogue({ category })}
            className={cn(
              "shrink-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              variant === "nav"
                ? cn(
                    "flex h-control-md items-center border-b-2 border-transparent text-[length:var(--text-body-sm)]",
                    active
                      ? "border-focus font-semibold text-ink"
                      : "text-ink-secondary hover:text-ink",
                  )
                : cn(
                    "flex h-control-sm items-center rounded-pill border px-sm text-[length:var(--text-body-sm)]",
                    active
                      ? "border-ink bg-ink font-semibold text-canvas"
                      : "border-hairline-strong text-ink-secondary",
                  ),
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
