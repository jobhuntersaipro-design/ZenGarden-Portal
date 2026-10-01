"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { shopHref } from "@/lib/shop-routes";
import chip from "@/components/arc/chip-group/chip-group.module.css";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { ArcSelection } from "@/components/ui/arc-selection";

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

  // The desktop row is Arc's tab track with the gliding pill; the phone
  // scroller is Arc's chips.
  return (
    <nav
      aria-label="Shop by category"
      className={cn(
        "flex items-center",
        variant === "nav" ? "isolate gap-xxs overflow-x-auto py-xxs" : "w-max gap-xs",
      )}
    >
      {items.map(({ key, label, category }) => {
        const active = onCatalogue && (category ?? null) === activeCategory;
        const href = shopHref.catalogue({ category });
        if (variant === "nav") {
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              data-state={active ? "active" : "inactive"}
              className={cn(tabs.trigger, "min-w-0")}
            >
              {active ? <ArcSelection id="category-selection" /> : null}
              <span className={tabs.triggerLabel}>{label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(chip.chip, active && "text-ink")}
          >
            <span className={cn(chip.body, "h-control-sm")} data-selected={active}>
              <span className={cn(chip.surface, "right-0")} aria-hidden />
              <span className={chip.label}>{label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
