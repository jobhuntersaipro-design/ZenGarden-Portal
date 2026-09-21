import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderRow } from "@/components/demand/DemandTable";
import type { DemandBoard, DemandLine } from "@/lib/queries/demand";

const board: DemandBoard = {
  grain: "day",
  columns: [
    { key: "2026-09-23", label: "23 Sep" },
    { key: "2026-09-26", label: "26 Sep" },
  ],
  rows: [],
  totals: { byColumn: {}, overdue: 0, committed: 0 },
  openOrders: 0,
  counted: 0,
  anyOverdue: true,
};

const line = (over: Partial<DemandLine> = {}): DemandLine => ({
  purchaseOrderId: "po_1",
  label: "Order ID W-2609-00012",
  buyerName: "Hong Tong Sdn Bhn.",
  stage: "ORDER_PLACED",
  deliveryDate: "20 Sep 2026",
  cartons: 7,
  columnKey: null,
  daysLate: 1,
  ...over,
});

const row = (over: Partial<DemandLine> = {}) =>
  renderToStaticMarkup(
    <table>
      <tbody>
        <OrderRow line={line(over)} board={board} />
      </tbody>
    </table>,
  );

/**
 * The identifier is what a planner reads a sub-row for and what they open, so
 * it has to survive the column's width and it has to be the link. Sharing a
 * line with the expected date left it cut to `Order ID …` — a row naming no
 * order at all.
 */
describe("a demand sub-row's order identifier", () => {
  it("links to the purchase order", () => {
    const markup = row();
    expect(markup).toContain('href="/purchase-orders/po_1"');
    expect(markup).toContain("Order ID W-2609-00012</a>");
  });

  it("carries a PO number where the order has no Order ID", () => {
    const markup = row({ label: "PO number PO-2026-0039" });
    expect(markup).toContain("PO number PO-2026-0039</a>");
  });

  it("holds the line to itself, with the date and lateness below it", () => {
    const markup = row();
    // The identifier closes the link, and a new block opens for the date —
    // sharing one line with it is what cut the identifier short.
    const after = markup.slice(markup.indexOf("Order ID W-2609-00012</a>"));
    expect(after).toMatch(/^Order ID W-2609-00012<\/a><p[^>]*>/);
    expect(after).toContain("20 Sep 2026");
    expect(after).toContain("1 day late");
  });

  it("names the buyer, and leaves them as text now the link has moved", () => {
    const markup = row();
    expect(markup).toContain("Hong Tong Sdn Bhn.");
    // One link in the row, and it is the order's.
    expect(markup.match(/<a /g)).toHaveLength(1);
  });

  it("puts the order's cartons in the column its parent counted them in", () => {
    const markup = row({ columnKey: "2026-09-26", daysLate: 0, cartons: 300 });
    expect(markup).toContain("300");
    expect(markup).not.toContain("late");
  });
});
