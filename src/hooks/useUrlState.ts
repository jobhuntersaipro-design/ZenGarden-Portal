"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * URL is state (00-master.md §4). Reads one searchParams key and writes it
 * back with router.replace, so filters survive reload and share.
 *
 * Changing any key other than `page` resets `page` to 1 — a filter that keeps
 * you on page 7 of a shorter result set shows an empty table.
 */
export function useUrlState(
  key: string,
  defaultValue = "",
): [string, (next: string | null) => void] {
  const router = useRouter();
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
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [key, pathname, router, searchParams],
  );

  return [value, set];
}
