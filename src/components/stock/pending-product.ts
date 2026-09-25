"use client";

import { useSyncExternalStore } from "react";
import type { StockSheetRow } from "@/lib/queries/stock";

/**
 * The product a reader has just opened on /stock, before the server has
 * answered with its counts (2026-09-25). Opening a row used to leave the
 * screen unchanged for the whole round trip — 200ms locally, longer on
 * production — with no spinner and no bar. The table sets this the moment a
 * row is opened, and the drawer opens on it at once, with the product's own
 * name and a loading body, until the page's own `product` arrives.
 */
let pending: StockSheetRow | null = null;
const listeners = new Set<() => void>();

export function setPendingStockProduct(row: StockSheetRow | null) {
  pending = row;
  for (const listener of listeners) listener();
}

export function usePendingStockProduct(): StockSheetRow | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
