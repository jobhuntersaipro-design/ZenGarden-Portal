"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import type { SortDirection } from "@/lib/queries/pagination";

/**
 * Writes `?sort=&dir=` and hands the callback to whatever wants it. Kept out
 * of `DataTable` so a screen can drive the same sort from somewhere else —
 * Products (Phase 08) has a segmented control that must share one piece of
 * state with the table headers and stay in step with them.
 */
export function useTableSort(): (key: string, dir: SortDirection) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, dir: SortDirection) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sort", key);
      params.set("dir", dir);
      // Sorting resets the page and leaves every filter alone.
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
}
