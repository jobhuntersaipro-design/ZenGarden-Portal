import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductStockCard } from "@/components/stock/ProductStockCard";
import { StockMovementFeed } from "@/components/stock/StockMovementFeed";
import { OUT_FOR_DELIVERY_REASON } from "@/lib/delivery-stock";
import type { StockMovementRow } from "@/lib/queries/stock";

const movement: StockMovementRow = {
  id: "m1",
  productId: "p-goat",
  productName: "ZEN 2.1L — Goat's Milk",
  quantity: 3,
  beforeCartons: 10,
  afterCartons: 7,
  purchaseOrderId: "po-1",
  poNumber: "PO-100",
  reason: OUT_FOR_DELIVERY_REASON,
  actorName: "Aisha Rahman",
  createdAt: "2026-10-06T02:00:00.000Z",
};

describe("StockMovementFeed", () => {
  it("shows the deduction, the order and the reason", () => {
    const html = renderToStaticMarkup(<StockMovementFeed rows={[movement]} />);
    expect(html).toContain("3 cartons out for delivery, 10 → 7, PO-100. Out for Delivery");
    expect(html).toContain("/purchase-orders/po-1");
    expect(html).toContain("PO-100");
    expect(html).toContain("Aisha Rahman");
  });

  it("renders nothing when there has been no delivery", () => {
    expect(renderToStaticMarkup(<StockMovementFeed rows={[]} />)).toBe("");
  });
});

describe("ProductStockCard", () => {
  it("shows on-hand after a delivery, not the last count", () => {
    const html = renderToStaticMarkup(
      <ProductStockCard
        productId="p-goat"
        onHand={7}
        rows={[
          {
            id: "c1",
            countedOn: "2026-09-12",
            cartons: 10,
            note: null,
            countedByName: "Aisha Rahman",
            createdAt: "2026-09-12T02:00:00.000Z",
            supersedesId: null,
            supersededById: null,
          },
        ]}
        movements={[movement]}
      />,
    );
    expect(html).toContain("7 cartons");
    expect(html).toContain("On hand, after deliveries");
    expect(html).toContain("Out for Delivery");
  });
});
