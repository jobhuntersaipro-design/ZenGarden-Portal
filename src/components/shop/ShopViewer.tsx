"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ShopViewer } from "@/lib/shop-viewer";

// Not imported from `@/lib/shop-viewer`: that module also exports
// `loadShopViewer`, which pulls in Prisma at module scope. A client component
// importing even one value from it — `GUEST` included — drags the whole
// module, and Prisma's client runtime, into the browser bundle.
const GUEST_VIEWER: ShopViewer = { kind: "guest" };

const ShopViewerContext = createContext<ShopViewer>(GUEST_VIEWER);

/**
 * The shop's one source for who is looking at it, set once by the layout from
 * a server-read session so no client component below it re-derives "guest or
 * client" from its own fetch.
 */
export function ShopViewerProvider({
  viewer,
  children,
}: {
  viewer: ShopViewer;
  children: ReactNode;
}) {
  return (
    <ShopViewerContext.Provider value={viewer}>{children}</ShopViewerContext.Provider>
  );
}

export function useShopViewer(): ShopViewer {
  return useContext(ShopViewerContext);
}
