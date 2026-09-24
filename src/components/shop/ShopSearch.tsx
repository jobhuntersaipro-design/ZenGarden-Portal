"use client";

import { Suspense, useId } from "react";
import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "cn";
import { beginRouteProgress, requestSoftNavigation } from "@/lib/route-progress";

/**
 * A plain `<form action="/products" method="get">` — the browser does the
 * navigation, so submitting it needs no client JS at all. The only reason
 * this is a client component is `defaultValue`, read from the URL so the
 * field shows what was searched rather than starting blank on every page.
 */
function ShopSearchField({ className }: { className?: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  // `?q=` is the catalogue's search only on the catalogue. My orders has its
  // own `?q=` (Phase 57), and the header must not echo an order number back
  // as a product search.
  const onCatalogue = /^(\/shop)?\/products$/.test(usePathname());
  // The desktop and mobile headers both render this field at once (only
  // `display` differs, so both are in the DOM), so a fixed id would collide
  // and the mobile label would resolve to the hidden desktop input.
  const id = useId();

  return (
    <form
      action="/products"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        const query = String(new FormData(event.currentTarget).get("q") ?? "").trim();
        const href = query ? `/products?q=${encodeURIComponent(query)}` : "/products";
        // Already on the catalogue: keep the grid and refresh it. Anywhere
        // else this is a route change, and the catalogue skeleton should show.
        if (window.location.pathname === "/products" && requestSoftNavigation(href)) return;
        beginRouteProgress();
        router.push(href);
      }}
      className={cn(
        "flex h-control-md items-center gap-sm rounded-pill border border-hairline-strong bg-canvas pr-xxs pl-md",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
      <label htmlFor={id} className="sr-only">
        Search the catalogue
      </label>
      <input
        id={id}
        type="text"
        name="q"
        defaultValue={onCatalogue ? (searchParams.get("q") ?? "") : ""}
        placeholder={`Search the catalogue — try "lavender" or "2.1L"`}
        className="min-w-0 flex-1 border-0 bg-transparent text-[length:var(--text-body-sm)] text-ink outline-none placeholder:text-ink-tertiary"
      />
      <button
        type="submit"
        className="flex h-8 shrink-0 items-center rounded-pill bg-ink px-md text-[length:var(--text-body-sm)] font-semibold text-canvas hover:bg-ink-deep"
      >
        Search
      </button>
    </form>
  );
}

export function ShopSearch({ className }: { className?: string }) {
  return (
    <Suspense fallback={<div className={cn("h-control-md", className)} aria-hidden />}>
      <ShopSearchField className={className} />
    </Suspense>
  );
}
