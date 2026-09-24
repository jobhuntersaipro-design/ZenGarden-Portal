import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BuyerOrderRow } from "@/components/shop/orders/BuyerOrdersTable";

// Sorting and paging write the URL through the router; neither is what these
// tests are about, and a static render has no router to reach.
vi.mock("@/hooks/useTableSort", () => ({ useTableSort: () => () => {} }));
vi.mock("@/components/portal/TablePagination", () => ({ TablePagination: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/orders",
  useSearchParams: () => new URLSearchParams(),
}));

const { BuyerOrdersTable } = await import("@/components/shop/orders/BuyerOrdersTable");

const row = (over: Partial<BuyerOrderRow>): BuyerOrderRow => ({
  id: "o1",
  orderId: null,
  buyerReference: "PO-2026-0072",
  date: "21 Sep 2026",
  deliveryDate: "8 Oct 2026",
  status: "In production",
  declined: false,
  lineCount: 4,
  total: "33453.07",
  ...over,
});

const render = (rows: BuyerOrderRow[]) =>
  renderToStaticMarkup(
    <BuyerOrdersTable rows={rows} sort={{ key: "date", dir: "desc" }} page={1} size={20} total={rows.length} />,
  );

/** The text of every header cell, in order. */
const headers = (html: string) =>
  [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

describe("BuyerOrdersTable", () => {
  // `DataTable` titles each phone card with the first column. With Order ID
  // first, every scanned order — which has no Order ID — was headed "—".
  it("leads with the buyer's own PO number, then our Order ID", () => {
    const html = render([row({})]);
    expect(headers(html).slice(0, 2)).toEqual(["Your PO number", "Order ID"]);
  });

  it("titles an order with no PO number by its Order ID rather than a dash", () => {
    const html = render([row({ buyerReference: null, orderId: "W-2609-00014" })]);
    const firstCell = html.match(/<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? "";
    expect(firstCell).toContain("W-2609-00014");
    expect(firstCell).not.toMatch(/>—</);
  });
});
