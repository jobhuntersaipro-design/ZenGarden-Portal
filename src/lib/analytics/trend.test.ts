import { describe, expect, it } from "vitest";
import { seriesOptions, seriesPerBucket, subjectKey } from "@/lib/analytics/trend";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

const FROM = new Date("2026-09-01T00:00:00Z");
const TO = new Date("2026-09-03T15:00:00Z");

const line = (
  market: string | null,
  amount: number,
  over: Partial<AnalyticsLineItem> = {},
): AnalyticsLineItem => ({
  productId: "p1",
  productName: "Product one",
  market,
  brand: "Zen Garden",
  category: "Shower cream & gel",
  quantity: 1,
  amount,
  ...over,
});

const order = (
  poDate: string,
  lines: AnalyticsLineItem[],
  buyer = { id: "b1", name: "Acme" },
): AnalyticsOrder => ({
  id: `po-${poDate}-${buyer.id}-${Math.random()}`,
  buyerId: buyer.id,
  buyerName: buyer.name,
  poDate: new Date(`${poDate}T04:00:00Z`),
  deliveryDate: null,
  total: lines.reduce((sum, l) => sum + l.amount, 0),
  stage: "ORDER_PLACED",
  lineItems: lines,
  stageEvents: [],
});

const amount = (l: AnalyticsLineItem) => l.amount;

describe("a trend over any subject", () => {
  it("sums a market's line value per bucket, empty buckets included", () => {
    const points = seriesPerBucket(
      [
        order("2026-09-01", [line("Vietnam", 30), line("Mydin", 10)]),
        order("2026-09-03", [line("Vietnam", 70)]),
      ],
      ["Vietnam", "Mydin"],
      subjectKey("market"),
      amount,
      FROM,
      TO,
      "day",
    );
    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ Vietnam: 30, Mydin: 10 });
    // The quiet day is drawn as quiet rather than left out.
    expect(points[1]).toMatchObject({ Vietnam: 0, Mydin: 0 });
    expect(points[2].Vietnam).toBe(70);
  });

  it("keys a buyer off the order and a market off the line", () => {
    // A buyer belongs to the document; a market belongs to the product. One
    // order can be one buyer and two markets at the same time.
    const orders = [order("2026-09-01", [line("Vietnam", 30), line("Mydin", 70)])];
    const byBuyer = seriesPerBucket(
      orders, ["b1"], subjectKey("buyer"), amount, FROM, TO, "day",
    );
    expect(byBuyer[0].b1).toBe(100);
    const byMarket = seriesPerBucket(
      orders, ["Vietnam", "Mydin"], subjectKey("market"), amount, FROM, TO, "day",
    );
    expect(byMarket[0]).toMatchObject({ Vietnam: 30, Mydin: 70 });
  });

  it("drops a line whose subject is null rather than inventing a series", () => {
    const points = seriesPerBucket(
      [order("2026-09-01", [line(null, 50), line("Vietnam", 20)])],
      ["Vietnam"],
      subjectKey("market"),
      amount,
      FROM,
      TO,
      "day",
    );
    expect(points[0].Vietnam).toBe(20);
  });

  it("ignores a series that was not selected, so a seventh line is never drawn", () => {
    const points = seriesPerBucket(
      [order("2026-09-01", [line("Mydin", 90)])],
      ["Vietnam"],
      subjectKey("market"),
      amount,
      FROM,
      TO,
      "day",
    );
    expect(points[0].Vietnam).toBe(0);
    expect(points[0].Mydin).toBeUndefined();
  });

  it("draws either measure through the same walk", () => {
    const orders = [
      order("2026-09-01", [line("Vietnam", 300, { quantity: 4 })]),
    ];
    const money = seriesPerBucket(
      orders, ["Vietnam"], subjectKey("market"), (l) => l.amount, FROM, TO, "day",
    );
    const units = seriesPerBucket(
      orders, ["Vietnam"], subjectKey("market"), (l) => l.quantity, FROM, TO, "day",
    );
    expect(money[0].Vietnam).toBe(300);
    expect(units[0].Vietnam).toBe(4);
  });
});

describe("the series a subject offers, ranked", () => {
  const orders = [
    order("2026-09-01", [line("Vietnam", 30), line("Mydin", 90)]),
    order("2026-09-02", [line("Vietnam", 20)], { id: "b2", name: "Beta" }),
  ];

  it("ranks markets by the measure, biggest first", () => {
    const options = seriesOptions(orders, "market", amount);
    expect(options.map((o) => o.id)).toEqual(["Mydin", "Vietnam"]);
    expect(options[0].value).toBe(90);
    expect(options[1].value).toBe(50);
  });

  it("names a buyer by their name and a market by itself", () => {
    expect(seriesOptions(orders, "buyer", amount).map((o) => o.name)).toContain("Acme");
    expect(seriesOptions(orders, "market", amount)[0].name).toBe("Mydin");
  });

  it("offers nothing for a subject every line is null on", () => {
    const orphans = [
      order("2026-09-01", [
        line(null, 50, { productId: null, productName: null }),
      ]),
    ];
    expect(seriesOptions(orphans, "market", amount)).toEqual([]);
    expect(seriesOptions(orphans, "product", amount)).toEqual([]);
    // The buyer is on the order, so it survives a line with no product.
    expect(seriesOptions(orphans, "buyer", amount)).toHaveLength(1);
  });
});
