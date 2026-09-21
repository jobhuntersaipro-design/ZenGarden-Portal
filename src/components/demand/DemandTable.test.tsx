import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OrderRow } from "@/components/demand/DemandTable";
import type { DemandBoard, DemandLine } from "@/lib/queries/demand";

const board: DemandBoard = {
  grain: "week",
  columns: [
    { key: "2026-W39", label: "21–27 Sep" },
    { key: "2026-W40", label: "28 Sep–4 Oct" },
  ],
  anyOverdue: true,
  rows: [],
  totals: { overdue: 0, byColumn: {}, committed: 0 },
  openOrders: 0,
  counted: 0,
};

const line = (over: Partial<DemandLine> = {}): DemandLine => ({
  purchaseOrderId: "po_1",
  label: "PO number PO-2026-0039",
  buyerName: "Meridian Chemicals",
  stage: "DELIVERING",
  deliveryDate: "12 Sep 2026",
  cartons: 27,
  columnKey: null,
  daysLate: 9,
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
 * The identifier is what a planner carries out of this row, so it is the one
 * thing here that may not be abbreviated — and the one thing that has to be
 * clickable. Both were wrong on first build: the caption squeezed the label
 * to `Order ID W-2609-0…` while the date beside it held its width, and the
 * link was on the buyer's name instead.
 */
describe("a demand sub-row's order identifier", () => {
  it("links to the order's own page", () => {
    const markup = row();
    expect(markup).toContain('href="/purchase-orders/po_1"');
    // On the identifier itself, not on the buyer's name beside it.
    expect(markup).toMatch(/href="\/purchase-orders\/po_1"[^>]*>PO number PO-2026-0039</);
  });

  it("is exactly one link, so the row names one destination", () => {
    expect(row().match(/<a /g)).toHaveLength(1);
  });

  it("is never shortened, whatever sits beside it", () => {
    const markup = row({ label: "Order ID W-2609-00051", buyerName: "Pacific Timber Sdn Bhd" });
    // `truncate` on the identifier, or on the line holding it, is the defect.
    const caption = markup.slice(markup.indexOf("Order ID W-2609-00051") - 400);
    expect(caption).toContain("whitespace-nowrap");
    expect(markup).toContain("Order ID W-2609-00051");
    expect(markup).toContain("flex-wrap");
  });

  it("carries the buyer's full name where the name is what gives way", () => {
    const markup = row({ buyerName: "A Very Long Buyer Name Sdn Bhd" });
    expect(markup).toContain('title="A Very Long Buyer Name Sdn Bhd"');
  });

  it("puts the lateness beside the date, never in a numeric column", () => {
    const markup = row();
    expect(markup).toContain("9 days late");
    // One day is not "1 days late".
    expect(row({ daysLate: 1 })).toContain("1 day late");
  });

  it("separates the facts in the text, not only with a gap", () => {
    // Flex items concatenate when the line is read out or copied, and the
    // first build of this row glued them: `PO-2026-0039· 12 Sep 2026`.
    const text = row().replace(/<[^>]+>/g, "");
    expect(text).toContain("PO number PO-2026-0039 · 12 Sep 2026 · 9 days late");
  });

  it("says nothing about lateness on an order that is not late", () => {
    const markup = row({ daysLate: 0, columnKey: "2026-W39" });
    expect(markup).not.toContain("late");
  });
});
