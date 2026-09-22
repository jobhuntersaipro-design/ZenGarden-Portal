"use client";

import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The one control on this page, by choice (2026-09-22). The catalogue's own
 * brand, category and market selects were offered and left out: the job here
 * is finding one product to count, and search does that in a keystroke where
 * three selects are three decisions.
 *
 * Writes `?q=` and resets to page 1, because a filtered list has no page 4.
 */
export function StockSearch({ initial }: { initial: string }) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    next.delete("page");
    // The drawer is keyed on the URL too; searching must not leave it open on
    // a product the new list may not even contain.
    next.delete("product");
    const search = next.toString();
    replace(search ? `${pathname}?${search}` : pathname);
  };

  return (
    <div className="relative mb-md">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
      />
      <Input
        aria-label="Search products to count"
        placeholder="Name or SKU…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => write(event.target.value), SEARCH_DEBOUNCE_MS);
        }}
        className="h-control-md sm:h-control-sm w-full pl-xl sm:w-72"
      />
    </div>
  );
}
