"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * URL is state (00-master.md §4). Reads one searchParams key and writes it
 * back through `useUrlNavigation`, so filters survive reload and share and
 * the write reports itself to the progress bar.
 *
 * Changing any key other than `page` resets `page` to 1 — a filter that keeps
 * you on page 7 of a shorter result set shows an empty table.
 */
export function useUrlState(
  key: string,
  defaultValue = "",
): [string, (next: string | null) => void] {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? defaultValue;

  const set = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === null || next === "") params.delete(key);
      else params.set(key, next);

      if (key !== "page") params.delete("page");

      const query = params.toString();
      replace(query ? `${pathname}?${query}` : pathname);
    },
    [key, pathname, replace, searchParams],
  );

  return [value, set];
}
