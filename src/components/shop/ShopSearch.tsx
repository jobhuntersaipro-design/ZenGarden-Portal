"use client";

import { Suspense } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { cn } from "cn";

/**
 * A plain `<form action="/products" method="get">` — the browser does the
 * navigation, so submitting it needs no client JS at all. The only reason
 * this is a client component is `defaultValue`, read from the URL so the
 * field shows what was searched rather than starting blank on every page.
 */
function ShopSearchField({ className }: { className?: string }) {
  const searchParams = useSearchParams();

  return (
    <form
      action="/products"
      method="get"
      className={cn(
        "flex h-control-md items-center gap-sm rounded-pill border border-hairline-strong bg-canvas pr-xxs pl-md",
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
      <label htmlFor="shop-search-q" className="sr-only">
        Search the catalogue
      </label>
      <input
        id="shop-search-q"
        type="text"
        name="q"
        defaultValue={searchParams.get("q") ?? ""}
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
