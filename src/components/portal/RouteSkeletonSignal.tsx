"use client";

import { useLayoutEffect } from "react";
import { noteRouteSkeleton } from "@/lib/route-progress";

/**
 * Rendered only by `PageSkeleton`, which every `loading.tsx` uses. Mounted
 * means the destination has not settled; the unmount is the settle.
 */
export function RouteSkeletonSignal() {
  useLayoutEffect(() => {
    noteRouteSkeleton(true);
    return () => noteRouteSkeleton(false);
  }, []);
  return null;
}
