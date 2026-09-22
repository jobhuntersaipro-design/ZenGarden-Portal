import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  NO_PRODUCT,
  stageByProduct,
  stageProductsByBucket,
} from "@/lib/analytics/stage-products";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

const line = (
  productId: string | null,
  productName: string | null,
): AnalyticsLineItem => ({
  productId,
  productName,
  market: null,
  brand: null,
  category: null,
  quantity: 1,
  amount: 100,
});

let seq = 0;
const order = (
  poDate: string,
  stage: PoStage,
  lineItems: AnalyticsLineItem[],
): AnalyticsOrder => ({
  id: `o${seq++}`,
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date(`${poDate}T04:00:00Z`),
  deliveryDate: null,
  total: 100,
  stage,
  lineItems,
  stageEvents: [],
});

describe("stageByProduct", () => {
  it("counts each product's orders into the stage the order stands at", () => {
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.IN_PRODUCTION, [line("p1", "Lemon")]),
        order("2026-09-01", PoStage.DELIVERED, [line("p1", "Lemon")]),
        order("2026-09-01", PoStage.DELIVERED, [line("p2", "Lime")]),
      ],
      "day",
      null,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productId: "p1",
      productName: "Lemon",
      total: 2,
      IN_PRODUCTION: 1,
      DELIVERED: 1,
      ORDER_PLACED: 0,
    });
    expect(rows[1]).toMatchObject({ productId: "p2", total: 1, DELIVERED: 1 });
  });

  it("counts one order once per product however many lines carry it", () => {
    // A document printing the same product twice is one order at one stage.
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.QC_PASSED, [
          line("p1", "Lemon"),
          line("p1", "Lemon"),
        ]),
      ],
      "day",
      null,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1);
    expect(rows[0].QC_PASSED).toBe(1);
  });

  it("counts an order carrying two products once under each", () => {
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.DELIVERING, [
          line("p1", "Lemon"),
          line("p2", "Lime"),
        ]),
      ],
      "day",
      null,
    );

    expect(rows.map((row) => [row.productId, row.total])).toEqual([
      ["p1", 1],
      ["p2", 1],
    ]);
  });

  it("gathers lines that matched no product into one remainder row", () => {
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.ORDER_PLACED, [line(null, "Some text")]),
        order("2026-09-01", PoStage.DELIVERED, [line(null, null)]),
      ],
      "day",
      null,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].productId).toBe(NO_PRODUCT);
    expect(rows[0].total).toBe(2);
  });

  it("pins the remainder row last however busy it is", () => {
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.DELIVERED, [line(null, null)]),
        order("2026-09-01", PoStage.DELIVERED, [line(null, null)]),
        order("2026-09-01", PoStage.DELIVERED, [line(null, null)]),
        order("2026-09-01", PoStage.DELIVERED, [line("p1", "Lemon")]),
      ],
      "day",
      null,
    );

    expect(rows.map((row) => row.productId)).toEqual(["p1", NO_PRODUCT]);
  });

  it("keeps only the orders in the bucket asked for", () => {
    const orders = [
      order("2026-09-01", PoStage.DELIVERED, [line("p1", "Lemon")]),
      order("2026-09-02", PoStage.DELIVERED, [line("p1", "Lemon")]),
    ];

    expect(stageByProduct(orders, "day", "2026-09-01")[0].total).toBe(1);
    expect(stageByProduct(orders, "day", null)[0].total).toBe(2);
    expect(stageByProduct(orders, "day", "2026-09-09")).toEqual([]);
  });

  it("buckets by the grain it is given", () => {
    const orders = [
      order("2026-09-01", PoStage.DELIVERED, [line("p1", "Lemon")]),
      order("2026-09-20", PoStage.DELIVERED, [line("p1", "Lemon")]),
    ];

    // Two different days, one month. A bucket key is always the first day
    // of its own period, `yyyy-MM-dd`, whatever the grain.
    expect(stageByProduct(orders, "month", "2026-09-01")[0].total).toBe(2);
    expect(stageByProduct(orders, "day", "2026-09-01")[0].total).toBe(1);
  });

  it("orders ties by name so the board does not shuffle between renders", () => {
    const rows = stageByProduct(
      [
        order("2026-09-01", PoStage.DELIVERED, [line("p2", "Beta")]),
        order("2026-09-01", PoStage.DELIVERED, [line("p1", "Alpha")]),
      ],
      "day",
      null,
    );

    expect(rows.map((row) => row.productName)).toEqual(["Alpha", "Beta"]);
  });
});

describe("stageProductsByBucket", () => {
  it("answers every bucket from one pass", () => {
    const byBucket = stageProductsByBucket(
      [
        order("2026-09-01", PoStage.DELIVERED, [line("p1", "Lemon")]),
        order("2026-09-02", PoStage.IN_PRODUCTION, [line("p2", "Lime")]),
      ],
      "day",
      ["2026-09-01", "2026-09-02", "2026-09-03"],
    );

    expect(byBucket["2026-09-01"][0].productId).toBe("p1");
    expect(byBucket["2026-09-02"][0].productId).toBe("p2");
    expect(byBucket["2026-09-03"]).toEqual([]);
  });
});
