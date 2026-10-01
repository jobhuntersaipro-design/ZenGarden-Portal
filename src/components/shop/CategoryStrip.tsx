"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { shopHref } from "@/lib/shop-routes";
import chip from "@/components/arc/chip-group/chip-group.module.css";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { ArcSelection } from "@/components/ui-mode/ArcSelection";
import { useIsArc } from "@/components/ui-mode/UiModeProvider";

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
  const isArc = useIsArc();

  // Arc mode: the desktop row is Arc's tab track with the gliding pill; the
  // phone scroller is Arc's chips. Same active rule as the classic shapes.
  if (isArc) {
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

  return (
    <nav
      aria-label="Shop by category"
      className={cn(
        "flex items-center",
        // Chips size to their labels. The header scroller is the scrollport;
        // overflow here would scroll inside the nav and the fade would never
        // see anything past the edge.
        variant === "nav" ? "gap-lg overflow-x-auto" : "w-max gap-xs",
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
