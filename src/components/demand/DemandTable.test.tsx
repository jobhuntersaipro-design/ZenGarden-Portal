import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemandTable, OrderRow } from "@/components/demand/DemandTable";
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
  families: [],
  products: [],
};

const line = (over: Partial<DemandLine> = {}): DemandLine => ({
  purchaseOrderId: "po_1",
  label: "PO number PO-2026-0039",
  orderIdLabel: null,
  buyerName: "Meridian Chemicals",
  stage: "DELIVERING",
  poDate: "1 Sep 2026",
  deliveryDate: "12 Sep 2026",
  cartons: 27,
  columnKey: null,
  daysLate: 9,
  dueInDays: null,
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
    const text = row().replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
    expect(text).toContain("12 Sep 2026 · 9 days late");
  });

  it("prints our Order ID under the buyer's PO number", () => {
    const text = row({ orderIdLabel: "Order ID W-2609-00014" })
      .replace(/<\/p>/g, "\n")
      .replace(/<[^>]+>/g, "");
    // Separate lines, because the two are quoted separately — never
    // `PO number … · Order ID …`, which has to be cut in half to be used.
    expect(text).toMatch(/PO number PO-2026-0039\s*\n\s*Order ID W-2609-00014/);
  });

  it("keeps the Order ID whole, however long the row's other lines are", () => {
    const markup = row({
      orderIdLabel: "Order ID W-2609-00014",
      buyerName: "A Very Long Buyer Name Indeed Sdn Bhd",
    });
    const at = markup.indexOf("Order ID W-2609-00014");
    expect(markup.slice(at - 200, at)).toContain("whitespace-nowrap");
  });

  it("prints no Order ID line where the order has none", () => {
    // A scanned purchase order was never given one. A dash here would be a
    // fact about nothing, repeated on every sub-row of a scan-only board.
    expect(row({ orderIdLabel: null })).not.toContain("Order ID");
  });

  it("says nothing about lateness on an order that is not late", () => {
    const markup = row({ daysLate: 0, columnKey: "2026-W39" });
    expect(markup).not.toContain("late");
  });
});

describe("a demand sub-row's dates", () => {
  it("labels both dates, so neither can be read as the other", () => {
    const text = row().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain("PO date 1 Sep 2026");
    expect(text).toContain("Expected 12 Sep 2026");
  });

  it("says how long until an order is due, in words", () => {
    const text = (over: Parameters<typeof row>[0]) =>
      row(over).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    expect(text({ daysLate: 0, dueInDays: 5 })).toContain("· due in 5 days");
    expect(text({ daysLate: 0, dueInDays: 1 })).toContain("· due in 1 day");
    expect(text({ daysLate: 0, dueInDays: 0 })).toContain("· due today");
  });

  /**
   * Grain-relative lateness, told the truth about. On a monthly board an
   * order a fortnight past its date is still September rather than Overdue,
   * and "due today" would be the board rounding in its own favour.
   */
  it("counts backwards where the grain says an order is not yet late", () => {
    const text = row({ daysLate: 0, dueInDays: -14 }).replace(/<[^>]+>/g, " ");
    expect(text).toContain("due 14 days ago");
    expect(text).not.toContain("late");
  });

  it("shows lateness instead of a due count, never both", () => {
    const text = row({ daysLate: 9, dueInDays: null }).replace(/<[^>]+>/g, " ");
    expect(text).toContain("9 days late");
    expect(text).not.toContain("due");
  });
});

describe("the board's stock column", () => {
  it("names the unit it is counted in", () => {
    const markup = renderToStaticMarkup(
      <DemandTable board={{ ...board, rows: [], openOrders: 0 }} />,
    );
    // Empty board renders its own card, so the header only exists with a row.
    expect(markup).not.toContain("On hand");
  });

  it("reads \"Stock count (carton)\", not \"On hand\"", () => {
    const markup = renderToStaticMarkup(
      <DemandTable
        board={{
          ...board,
          openOrders: 1,
          rows: [
            {
              productId: "p1",
              sku: "SKU-1",
              name: "ZEN 2.1L",
              variant: null,
              market: null,
              stockCartons: null,
              byColumn: {},
              overdue: 27,
              committed: 27,
              orders: 1,
              shortBy: null,
              lines: [line()],
            },
          ],
        }}
      />,
    );
    expect(markup).toContain("Stock count (carton)");
    expect(markup).not.toContain("On hand");
  });
});

describe("an order row folding in and out", () => {
  const folding = (closing: boolean) =>
    renderToStaticMarkup(
      <table>
        <tbody>
          <OrderRow line={line()} board={board} reveal={{ closing }} />
        </tbody>
      </table>,
    );

  it("moves every cell's padding inside the growing box", () => {
    // A padded cell holds the row open while its content shrinks.
    const out = folding(false);
    expect(out).not.toMatch(/<td[^>]*py-sm/);
    expect(out.match(/animate-reveal/g)?.length).toBeGreaterThan(3);
  });

  it("folds every cell together when it closes", () => {
    const out = folding(true);
    expect(out).not.toContain("animate-reveal");
    expect(out.match(/animate-conceal/g)?.length).toBe(out.match(/<td/g)?.length);
  });

  it("is unchanged when it is not folding", () => {
    expect(row()).not.toContain("reveal");
  });
});
