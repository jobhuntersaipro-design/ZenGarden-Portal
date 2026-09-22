import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import { deliveryByMarket } from "@/lib/analytics/delivery";
import type { AnalyticsLineItem, AnalyticsOrder } from "@/lib/analytics/types";

const line = (market: string | null): AnalyticsLineItem => ({
  productId: "p1",
  productName: "Product",
  market,
  brand: "Zen Garden",
  category: "Shower cream & gel",
  quantity: 1,
  amount: 100,
});

const order = ({
  id,
  markets,
  stage = PoStage.DELIVERED,
  deliveryDate,
  deliveredOn,
}: {
  id: string;
  markets: (string | null)[];
  stage?: PoStage;
  deliveryDate: string | null;
  deliveredOn?: string[];
}): AnalyticsOrder => ({
  id,
  buyerId: "b1",
  buyerName: "Acme",
  poDate: new Date("2026-09-01T04:00:00Z"),
  deliveryDate: deliveryDate ? new Date(`${deliveryDate}T00:00:00Z`) : null,
  total: 100,
  stage,
  lineItems: markets.map(line),
  stageEvents: (deliveredOn ?? []).map((at) => ({
    toStage: PoStage.DELIVERED,
    changedAt: new Date(at),
  })),
});

const rate = (rows: { market: string; rate: number | null }[], market: string) =>
  rows.find((row) => row.market === market)?.rate ?? null;

describe("on-time delivery, per market", () => {
  it("counts an order in every market it touches, because it was late in all of them", () => {
    // This is a rate, not a sum: the columns are not meant to add up, which
    // is what makes counting one order twice correct here and wrong for money.
    const result = deliveryByMarket([
      order({
        id: "po-1",
        markets: ["Vietnam", "Mydin"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-14T02:00:00Z"],
      }),
    ]);
    expect(rate(result.rows, "Vietnam")).toBe(0);
    expect(rate(result.rows, "Mydin")).toBe(0);
    expect(result.counted).toBe(1);
  });

  it("counts delivery on the expected day itself as on time", () => {
    const result = deliveryByMarket([
      order({
        id: "po-1",
        markets: ["Vietnam"],
        deliveryDate: "2026-09-10",
        // Late in the evening, Kuala Lumpur — still the tenth.
        deliveredOn: ["2026-09-10T15:30:00Z"],
      }),
    ]);
    expect(rate(result.rows, "Vietnam")).toBe(100);
  });

  it("measures the day in Kuala Lumpur, not in UTC", () => {
    // 2026-09-10T17:00Z is already the 11th in KL (UTC+8), so this is late.
    const result = deliveryByMarket([
      order({
        id: "po-1",
        markets: ["Vietnam"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-10T17:00:00Z"],
      }),
    ]);
    expect(rate(result.rows, "Vietnam")).toBe(0);
  });

  it("takes the first delivery, so a corrected stage cannot forgive a late one", () => {
    const result = deliveryByMarket([
      order({
        id: "po-1",
        markets: ["Vietnam"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-20T02:00:00Z", "2026-09-25T02:00:00Z"],
      }),
    ]);
    expect(rate(result.rows, "Vietnam")).toBe(0);
  });

  it("excludes an order with no expected date from both halves, and says how many", () => {
    // Counting it as on time would make a catalogue of undated orders look
    // like a perfect record.
    const result = deliveryByMarket([
      order({
        id: "dated",
        markets: ["Vietnam"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-09T02:00:00Z"],
      }),
      order({
        id: "undated",
        markets: ["Vietnam"],
        deliveryDate: null,
        deliveredOn: ["2026-09-30T02:00:00Z"],
      }),
    ]);
    expect(rate(result.rows, "Vietnam")).toBe(100);
    expect(result.rows[0].delivered).toBe(1);
    expect(result.undated).toBe(1);
  });

  it("ignores an order that has not been delivered, however late it looks", () => {
    // Lateness before delivery is the demand board's Overdue column; two
    // screens disagreeing about "late" is worse than one screen not saying.
    const result = deliveryByMarket([
      order({
        id: "open",
        markets: ["Vietnam"],
        stage: PoStage.DELIVERING,
        deliveryDate: "2020-01-01",
      }),
    ]);
    expect(result.rows).toEqual([]);
    expect(result.counted).toBe(0);
  });

  it("leaves out an order whose lines carry no market at all", () => {
    const result = deliveryByMarket([
      order({
        id: "po-1",
        markets: [null],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-09T02:00:00Z"],
      }),
    ]);
    expect(result.rows).toEqual([]);
  });

  it("ranks the worst market first, because that is what the card is read for", () => {
    const result = deliveryByMarket([
      order({
        id: "good",
        markets: ["Mydin"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-09T02:00:00Z"],
      }),
      order({
        id: "bad",
        markets: ["Vietnam"],
        deliveryDate: "2026-09-10",
        deliveredOn: ["2026-09-20T02:00:00Z"],
      }),
    ]);
    expect(result.rows.map((row) => row.market)).toEqual(["Vietnam", "Mydin"]);
  });
});
