import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProductStockDrawer } from "@/components/stock/ProductStockDrawer";
import type { StockSheetRow } from "@/lib/queries/stock";

vi.mock("@/actions/stock", () => ({ saveStockCounts: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/portal/NavProgress", () => ({ useNavProgress: () => {} }));
// Radix portals the panel onto document.body, which this runner does not
// have, so the sheet is rendered in place. The on-hand copy is the drawer's.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const product: StockSheetRow = {
  id: "p-goat",
  name: "ZEN 2.1L — Goat's Milk",
  sku: "ZEN-1",
  market: "VN",
  stockCartons: 40,
  lastCountedOn: null,
};

const count = {
  id: "c1",
  countedOn: "2026-09-12",
  cartons: 10,
  note: null,
  countedByName: "Aisha Rahman",
  createdAt: "2026-09-12T02:00:00.000Z",
  supersedesId: null,
  supersededById: null,
};

describe("ProductStockDrawer", () => {
  it("shows a legacy figure with no stocktake as not counted", () => {
    const html = renderToStaticMarkup(
      <ProductStockDrawer product={product} counts={[]} today="2026-10-06" />,
    );
    expect(html).toContain("Not counted yet");
    expect(html).toContain("Nobody has counted this product.");
    expect(html).not.toContain("40 cartons");
  });

  it("shows the cache once a stocktake exists", () => {
    const html = renderToStaticMarkup(
      <ProductStockDrawer
        product={{ ...product, stockCartons: 7 }}
        counts={[count]}
        today="2026-10-06"
      />,
    );
    expect(html).toContain("7 cartons");
    expect(html).toContain("On hand, after deliveries");
  });
});
