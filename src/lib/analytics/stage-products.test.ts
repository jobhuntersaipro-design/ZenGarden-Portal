import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  NO_PRODUCT,
  stageByProduct,
  stageProductsByBucket,
} from "@/lib/analytics/stage-products";
import type { Snapshot, StageOrder } from "@/lib/analytics/stage-history";

const line = (productId: string | null, productName: string | null) => ({
  productId,
  productName,
});

const at = (day: string) => new Date(`${day}T00:00:00+08:00`);

/**
 * The bucket that runs out when `end` opens — so its own last day is the one
 * before, which is what lateness is measured against.
 */
const upto = (end: string): Snapshot => {
  const day = new Date(Date.parse(`${end}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { key: day, label: day, end: at(end), day };
};

let nextId = 0;

/** `moves` is the order's own history: the day each stage was reached. */
const order = (
  moves: [PoStage, string][],
  lineItems: ReturnType<typeof line>[],
  deliveryDate: string | null = null,
): StageOrder => ({
  id: `po${(nextId += 1)}`,
  deliveryDate,
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

    const rows = stageByProduct(orders, upto("2026-09-13"));
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
      expect(stageByProduct(orders, upto(day))[0]).toMatchObject({
        total: 1,
        ORDER_PLACED: 1,
        QC_PASSED: 0,
      });
    }
    // Then it is QC passed, and no longer at Order placed.
    expect(stageByProduct(orders, upto("2026-09-16"))[0]).toMatchObject({
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

    expect(stageByProduct(orders, upto("2026-09-13"))).toHaveLength(1);
    expect(stageByProduct(orders, upto("2026-09-15"))).toEqual([]);
  });

  it("is absent before it was confirmed, whatever its PO date says", () => {
    const orders = [order([placed("2026-09-10")], [line("p1", "Lemon")])];

    expect(stageByProduct(orders, upto("2026-09-09"))).toEqual([]);
    expect(stageByProduct(orders, upto("2026-09-11"))).toHaveLength(1);
  });

  it("reads the history, not a current-stage column", () => {
    // The fixture has no `stage` field at all — the board cannot reach for
    // one, which is the whole point of the shape.
    const orders = [order([placed("2026-09-10")], [line("p1", "Lemon")])];
    expect(stageByProduct(orders, upto("2026-09-12"))[0]).toMatchObject({
      ORDER_PLACED: 1,
      DELIVERED: 0,
    });
  });

  it("ignores an order with no history rather than inventing one", () => {
    expect(
      stageByProduct([order([], [line("p1", "Lemon")])], upto("2026-09-12")),
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
      upto("2026-09-12"),
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
      upto("2026-09-12"),
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
      upto("2026-09-12"),
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
      upto("2026-09-12"),
    );
    expect(rows.map((r) => r.productId)).toEqual(["p1", NO_PRODUCT]);
  });

  it("orders ties by name so the board does not shuffle between renders", () => {
    const rows = stageByProduct(
      [
        order([placed("2026-09-10")], [line("p2", "Beta")]),
        order([placed("2026-09-10")], [line("p1", "Alpha")]),
      ],
      upto("2026-09-12"),
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
        { key: "2026-09-10", label: "10 Sep", day: "2026-09-10", end: at("2026-09-11") },
        { key: "2026-09-11", label: "11 Sep", day: "2026-09-11", end: at("2026-09-12") },
        { key: "2026-09-12", label: "12 Sep", day: "2026-09-12", end: at("2026-09-13") },
        { key: "2026-09-13", label: "13 Sep", day: "2026-09-13", end: at("2026-09-14") },
      ],
    );

    expect(byBucket["2026-09-10"]).toEqual([]); // not confirmed yet
    expect(byBucket["2026-09-11"][0]).toMatchObject({ ORDER_PLACED: 1 });
    expect(byBucket["2026-09-12"][0]).toMatchObject({ ORDER_PLACED: 1 });
    expect(byBucket["2026-09-13"]).toEqual([]); // delivered, off the board
  });
});

describe("the orders behind a product row", () => {
  const orders = [
    order(
      [placed("2026-09-10"), [PoStage.IN_PRODUCTION, "2026-09-12"]],
      [line("p1", "Lemon"), line("p2", "Lime")],
      "2026-09-11",
    ),
    order([placed("2026-09-10")], [line("p1", "Lemon")], "2026-09-30"),
    order([placed("2026-09-11")], [line("p1", "Lemon")], null),
  ];
  const bucket = upto("2026-09-16");

  it("sums to the row above it, which is what makes the row checkable", () => {
    const [row] = stageByProduct(orders, bucket).filter(
      (r) => r.productId === "p1",
    );
    expect(row.total).toBe(3);
    expect(row.orders).toHaveLength(row.total);
    for (const stage of [PoStage.ORDER_PLACED, PoStage.IN_PRODUCTION]) {
      expect(row.orders.filter((o) => o.stage === stage)).toHaveLength(
        row[stage],
      );
    }
    expect(row.orders.filter((o) => o.overdue)).toHaveLength(row.overdue);
  });

  it("counts an order late at the stage it is stuck at", () => {
    const [row] = stageByProduct(orders, bucket).filter(
      (r) => r.productId === "p1",
    );
    // Only the first is past 15 Sep; the second is due later and the third
    // has no date at all, so neither can be late.
    expect(row.overdue).toBe(1);
    expect(row.IN_PRODUCTION).toBe(1);
  });

  it("leads with the worst offender", () => {
    const [row] = stageByProduct(orders, bucket).filter(
      (r) => r.productId === "p1",
    );
    // Earliest expected first, and the order nobody dated sinks — blanks
    // sort last in both directions everywhere in this portal.
    expect(row.orders.map((o) => o.overdue)).toEqual([true, false, false]);
    expect(row.orders.at(-1)?.id).toBe(orders[2].id);
  });

  it("counts one order once per product, so the pair count is the sum", () => {
    const rows = stageByProduct(orders, bucket);
    const pairs = rows.reduce((sum, r) => sum + r.orders.length, 0);
    // Three orders carrying four distinct product lines between them.
    expect(pairs).toBe(4);
    expect(rows.map((r) => r.productId)).toEqual(["p1", "p2"]);
  });

  it("narrows to the late orders alone when the filter is on", () => {
    const rows = stageByProduct(orders, bucket, "overdue");
    expect(rows.map((r) => [r.productId, r.total, r.overdue])).toEqual([
      ["p1", 1, 1],
      ["p2", 1, 1],
    ]);
    // Every row's own orders are late too: one control, one population.
    for (const row of rows) {
      expect(row.orders.every((o) => o.overdue)).toBe(true);
    }
  });
});
