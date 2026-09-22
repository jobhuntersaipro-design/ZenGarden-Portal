import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import {
  openAt,
  pointBreakdown,
  stageAt,
  stageSnapshotBreakdown,
  stageSnapshotSeries,
} from "@/lib/analytics/stage-history";
import type { StageMove, StageOrder } from "@/lib/analytics/stage-history";

const at = (day: string) => new Date(`${day}T00:00:00+08:00`);

/** A history, chained through `fromStage` the way the database records it. */
const history = (moves: [PoStage, string][]): StageMove[] =>
  moves.map(([toStage, day], i) => ({
    fromStage: i === 0 ? null : moves[i - 1][0],
    toStage,
    changedAt: at(day),
  }));

const order = (moves: [PoStage, string][]): StageOrder => ({
  stageEvents: history(moves),
  lineItems: [],
});

const placed = (day: string): [PoStage, string] => [PoStage.ORDER_PLACED, day];

describe("stageAt", () => {
  it("replays the order's own history", () => {
    const o = order([
      placed("2026-09-10"),
      [PoStage.IN_PRODUCTION, "2026-09-12"],
      [PoStage.QC_PASSED, "2026-09-15"],
    ]);

    expect(stageAt(o.stageEvents, at("2026-09-09"))).toBeNull();
    expect(stageAt(o.stageEvents, at("2026-09-11"))).toBe(PoStage.ORDER_PLACED);
    expect(stageAt(o.stageEvents, at("2026-09-13"))).toBe(
      PoStage.IN_PRODUCTION,
    );
    expect(stageAt(o.stageEvents, at("2026-09-20"))).toBe(PoStage.QC_PASSED);
  });

  it("ends at the instant given, not at or after it", () => {
    const o = order([placed("2026-09-10")]);
    // The bucket for the 9th runs out exactly when the 10th opens, and the
    // order was confirmed at that moment — so it belongs to the 10th.
    expect(stageAt(o.stageEvents, at("2026-09-10"))).toBeNull();
    expect(stageAt(o.stageEvents, at("2026-09-11"))).toBe(PoStage.ORDER_PLACED);
  });

  it("is null once delivered", () => {
    const o = order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-14"]]);
    expect(stageAt(o.stageEvents, at("2026-09-13"))).toBe(PoStage.ORDER_PLACED);
    expect(stageAt(o.stageEvents, at("2026-09-15"))).toBeNull();
  });

  it("follows a move back", () => {
    const o = order([
      placed("2026-09-10"),
      [PoStage.QC_PASSED, "2026-09-12"],
      [PoStage.IN_PRODUCTION, "2026-09-13"],
    ]);
    expect(stageAt(o.stageEvents, at("2026-09-14"))).toBe(
      PoStage.IN_PRODUCTION,
    );
  });

  it("is null for an order carrying no history", () => {
    expect(stageAt(order([]).stageEvents, at("2026-09-14"))).toBeNull();
  });
});

describe("openAt", () => {
  it("returns only the orders open then, with the stage they stood at", () => {
    const open = openAt(
      [
        order([placed("2026-09-10")]),
        order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-11"]]),
        order([placed("2026-09-20")]),
      ],
      at("2026-09-13"),
    );
    expect(open).toHaveLength(1);
    expect(open[0].stage).toBe(PoStage.ORDER_PLACED);
  });
});

describe("stageSnapshotSeries", () => {
  const snapshots = [
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-13",
  ].map((key, i) => ({
    key,
    label: key,
    end: at(["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"][i]),
  }));

  it("carries an order across every day it was open", () => {
    const points = stageSnapshotSeries(
      [order([placed("2026-09-10"), [PoStage.IN_PRODUCTION, "2026-09-12"]])],
      snapshots,
    );
    expect(points.map((p) => p.total)).toEqual([1, 1, 1, 1]);
    expect(points.map((p) => p.ORDER_PLACED)).toEqual([1, 1, 0, 0]);
    expect(points.map((p) => p.IN_PRODUCTION)).toEqual([0, 0, 1, 1]);
  });

  it("drops it the day it is delivered", () => {
    const points = stageSnapshotSeries(
      [order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-12"]])],
      snapshots,
    );
    expect(points.map((p) => p.total)).toEqual([1, 1, 0, 0]);
    // Delivered is never drawn: the board counts work in hand.
    expect(points.map((p) => p.DELIVERED)).toEqual([0, 0, 0, 0]);
  });

  it("segments sum to the bar's total", () => {
    const points = stageSnapshotSeries(
      [
        order([placed("2026-09-10")]),
        order([placed("2026-09-10"), [PoStage.QC_PASSED, "2026-09-11"]]),
        order([placed("2026-09-11")]),
      ],
      snapshots,
    );
    for (const point of points) {
      const segments =
        point.ORDER_PLACED +
        point.IN_PRODUCTION +
        point.QC_PASSED +
        point.IN_WAREHOUSE +
        point.DELIVERING +
        point.DELIVERED;
      expect(segments).toBe(point.total);
    }
    // Two placed on the 10th, the third on the 11th.
    expect(points.map((p) => p.total)).toEqual([2, 3, 3, 3]);
  });
});

describe("stageSnapshotBreakdown", () => {
  it("counts every stage, zeros included, as things stand", () => {
    const rows = stageSnapshotBreakdown(
      [
        order([placed("2026-09-10")]),
        order([placed("2026-09-10"), [PoStage.DELIVERING, "2026-09-11"]]),
        order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-11"]]),
      ],
      at("2026-09-13"),
    );
    expect(rows).toHaveLength(6);
    expect(Object.fromEntries(rows.map((r) => [r.stage, r.count]))).toEqual({
      ORDER_PLACED: 1,
      IN_PRODUCTION: 0,
      QC_PASSED: 0,
      IN_WAREHOUSE: 0,
      DELIVERING: 1,
      DELIVERED: 0,
    });
  });
});

describe("events sharing a timestamp", () => {
  it("takes the furthest-progressed, which is the last one recorded", () => {
    // Two advances inside the same millisecond. The events arrive oldest
    // first, so the later one in the list is the one that happened last.
    const o = order([
      placed("2026-09-10"),
      [PoStage.IN_PRODUCTION, "2026-09-12"],
      [PoStage.QC_PASSED, "2026-09-12"],
    ]);
    expect(stageAt(o.stageEvents, at("2026-09-13"))).toBe(PoStage.QC_PASSED);
  });

  it("chains the tie rather than trusting its order in the list", () => {
    // The real shape that caught this: Prisma leaves ties in an arbitrary
    // order, and here the *later* move is listed first. Taking the last of
    // the list would report In warehouse for an order already out for
    // delivery.
    const same = at("2026-09-12");
    const o: StageOrder = {
      lineItems: [],
      stageEvents: [
        {
          fromStage: null,
          toStage: PoStage.ORDER_PLACED,
          changedAt: at("2026-09-10"),
        },
        {
          fromStage: PoStage.IN_WAREHOUSE,
          toStage: PoStage.DELIVERING,
          changedAt: same,
        },
        {
          fromStage: PoStage.QC_PASSED,
          toStage: PoStage.IN_WAREHOUSE,
          changedAt: same,
        },
      ],
    };
    expect(stageAt(o.stageEvents, at("2026-09-13"))).toBe(PoStage.DELIVERING);
  });

  it("still leaves the board when the tie ends in Delivered", () => {
    const o = order([
      placed("2026-09-10"),
      [PoStage.DELIVERING, "2026-09-12"],
      [PoStage.DELIVERED, "2026-09-12"],
    ]);
    expect(stageAt(o.stageEvents, at("2026-09-13"))).toBeNull();
  });
});

describe("pointBreakdown", () => {
  const days = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"];
  const snapshots = days.map((key, i) => ({
    key,
    label: key,
    end: at(["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"][i]),
  }));

  // Deliberately a pipeline that *moves*: the first day and the last read
  // different stages, so a legend computed from "now" cannot pass by
  // accident. That is the whole defect this guards against — the legend
  // under the chart showing today's figures beneath a bar from last week.
  const orders = [
    order([placed("2026-09-10"), [PoStage.IN_PRODUCTION, "2026-09-12"]]),
    order([
      placed("2026-09-10"),
      [PoStage.IN_PRODUCTION, "2026-09-11"],
      [PoStage.QC_PASSED, "2026-09-13"],
    ]),
    order([placed("2026-09-12")]),
  ];

  it("is the bar's own counts, not the board's", () => {
    const points = stageSnapshotSeries(orders, snapshots);
    const legend = (key: string) =>
      pointBreakdown(points.find((p) => p.key === key)!).map((e) => [
        e.stage,
        e.count,
      ]);

    expect(legend("2026-09-10")).toEqual([
      [PoStage.ORDER_PLACED, 2],
      [PoStage.IN_PRODUCTION, 0],
      [PoStage.QC_PASSED, 0],
      [PoStage.IN_WAREHOUSE, 0],
      [PoStage.DELIVERING, 0],
    ]);
    expect(legend("2026-09-13")).toEqual([
      [PoStage.ORDER_PLACED, 1],
      [PoStage.IN_PRODUCTION, 1],
      [PoStage.QC_PASSED, 1],
      [PoStage.IN_WAREHOUSE, 0],
      [PoStage.DELIVERING, 0],
    ]);
  });

  it("agrees with the breakdown at that same instant, on every bar", () => {
    const points = stageSnapshotSeries(orders, snapshots);
    for (const [i, point] of points.entries()) {
      expect(pointBreakdown(point)).toEqual(
        stageSnapshotBreakdown(orders, snapshots[i].end).filter(
          (entry) => entry.stage !== PoStage.DELIVERED,
        ),
      );
    }
  });

  it("sums to the bar's total, so the legend and the bar cannot disagree", () => {
    for (const point of stageSnapshotSeries(orders, snapshots)) {
      const total = pointBreakdown(point).reduce((sum, e) => sum + e.count, 0);
      expect(total).toBe(point.total);
    }
  });

  it("leaves Delivered out", () => {
    const points = stageSnapshotSeries(
      [order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-12"]])],
      snapshots,
    );
    for (const point of points) {
      expect(pointBreakdown(point).map((e) => e.stage)).not.toContain(
        PoStage.DELIVERED,
      );
    }
  });
});
