import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  NO_PRODUCT,
  stageByProduct,
  stageProductsByBucket,
} from "@/lib/analytics/stage-products";
import type { StageOrder } from "@/lib/analytics/stage-history";

const line = (productId: string | null, productName: string | null) => ({
  productId,
  productName,
});

const at = (day: string) => new Date(`${day}T00:00:00+08:00`);

/** `moves` is the order's own history: the day each stage was reached. */
const order = (
  moves: [PoStage, string][],
  lineItems: ReturnType<typeof line>[],
): StageOrder => ({
  stageEvents: moves.map(([toStage, day], i) => ({
    fromStage: i === 0 ? null : moves[i - 1][0],
    toStage,
    changedAt: at(day),
  })),
  lineItems,
});

const placed = (day: string): [PoStage, string] => [PoStage.ORDER_PLACED, day];

describe("stageByProduct", () => {
  it("counts a product's orders into the stage they stood at that day", () => {
    const orders = [
      order(
        [placed("2026-09-10"), [PoStage.IN_PRODUCTION, "2026-09-12"]],
        [line("p1", "Lemon")],
      ),
      order([placed("2026-09-11")], [line("p1", "Lemon")]),
      order([placed("2026-09-11")], [line("p2", "Lime")]),
    ];

    const rows = stageByProduct(orders, at("2026-09-13"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productId: "p1",
      total: 2,
      IN_PRODUCTION: 1,
      ORDER_PLACED: 1,
      QC_PASSED: 0,
    });
    expect(rows[1]).toMatchObject({
      productId: "p2",
      total: 1,
      ORDER_PLACED: 1,
    });
  });

  it("carries an order forward until it moves", () => {
    const orders = [
      order(
        [placed("2026-09-10"), [PoStage.QC_PASSED, "2026-09-15"]],
        [line("p1", "Lemon")],
      ),
    ];

    // Open and unmoved on the 12th, 13th and 14th — the same order each day.
    for (const day of ["2026-09-12", "2026-09-13", "2026-09-14"]) {
      expect(stageByProduct(orders, at(day))[0]).toMatchObject({
        total: 1,
        ORDER_PLACED: 1,
        QC_PASSED: 0,
      });
    }
    // Then it is QC passed, and no longer at Order placed.
    expect(stageByProduct(orders, at("2026-09-16"))[0]).toMatchObject({
      total: 1,
      ORDER_PLACED: 0,
      QC_PASSED: 1,
    });
  });

  it("leaves the board the day it is delivered", () => {
    const orders = [
      order(
        [placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-14"]],
        [line("p1", "Lemon")],
      ),
    ];

    expect(stageByProduct(orders, at("2026-09-13"))).toHaveLength(1);
    expect(stageByProduct(orders, at("2026-09-15"))).toEqual([]);
  });

  it("is absent before it was confirmed, whatever its PO date says", () => {
    const orders = [order([placed("2026-09-10")], [line("p1", "Lemon")])];

    expect(stageByProduct(orders, at("2026-09-09"))).toEqual([]);
    expect(stageByProduct(orders, at("2026-09-11"))).toHaveLength(1);
  });

  it("reads the history, not a current-stage column", () => {
    // The fixture has no `stage` field at all — the board cannot reach for
    // one, which is the whole point of the shape.
    const orders = [order([placed("2026-09-10")], [line("p1", "Lemon")])];
    expect(stageByProduct(orders, at("2026-09-12"))[0]).toMatchObject({
      ORDER_PLACED: 1,
      DELIVERED: 0,
    });
  });

  it("ignores an order with no history rather than inventing one", () => {
    expect(
      stageByProduct([order([], [line("p1", "Lemon")])], at("2026-09-12")),
    ).toEqual([]);
  });

  it("counts one order once per product however many lines carry it", () => {
    const rows = stageByProduct(
      [
        order(
          [placed("2026-09-10")],
          [line("p1", "Lemon"), line("p1", "Lemon")],
        ),
      ],
      at("2026-09-12"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1);
  });

  it("counts an order carrying two products once under each", () => {
    const rows = stageByProduct(
      [
        order(
          [placed("2026-09-10")],
          [line("p1", "Lemon"), line("p2", "Lime")],
        ),
      ],
      at("2026-09-12"),
    );
    expect(rows.map((r) => [r.productId, r.total])).toEqual([
      ["p1", 1],
      ["p2", 1],
    ]);
  });

  it("gathers lines that matched no product into one remainder row", () => {
    const rows = stageByProduct(
      [
        order([placed("2026-09-10")], [line(null, "Some text")]),
        order([placed("2026-09-10")], [line(null, null)]),
      ],
      at("2026-09-12"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ productId: NO_PRODUCT, total: 2 });
  });

  it("pins the remainder row last however busy it is", () => {
    const rows = stageByProduct(
      [
        order([placed("2026-09-10")], [line(null, null)]),
        order([placed("2026-09-10")], [line(null, null)]),
        order([placed("2026-09-10")], [line(null, null)]),
        order([placed("2026-09-10")], [line("p1", "Lemon")]),
      ],
      at("2026-09-12"),
    );
    expect(rows.map((r) => r.productId)).toEqual(["p1", NO_PRODUCT]);
  });

  it("orders ties by name so the board does not shuffle between renders", () => {
    const rows = stageByProduct(
      [
        order([placed("2026-09-10")], [line("p2", "Beta")]),
        order([placed("2026-09-10")], [line("p1", "Alpha")]),
      ],
      at("2026-09-12"),
    );
    expect(rows.map((r) => r.productName)).toEqual(["Alpha", "Beta"]);
  });
});

describe("stageProductsByBucket", () => {
  it("answers every bucket from one pass", () => {
    const byBucket = stageProductsByBucket(
      [
        order(
          [placed("2026-09-11"), [PoStage.DELIVERED, "2026-09-13"]],
          [line("p1", "Lemon")],
        ),
      ],
      [
        { key: "2026-09-10", label: "10 Sep", end: at("2026-09-11") },
        { key: "2026-09-11", label: "11 Sep", end: at("2026-09-12") },
        { key: "2026-09-12", label: "12 Sep", end: at("2026-09-13") },
        { key: "2026-09-13", label: "13 Sep", end: at("2026-09-14") },
      ],
    );

    expect(byBucket["2026-09-10"]).toEqual([]); // not confirmed yet
    expect(byBucket["2026-09-11"][0]).toMatchObject({ ORDER_PLACED: 1 });
    expect(byBucket["2026-09-12"][0]).toMatchObject({ ORDER_PLACED: 1 });
    expect(byBucket["2026-09-13"]).toEqual([]); // delivered, off the board
  });
});
