import { describe, expect, it } from "vitest";
import { PoStage } from "@/generated/prisma/enums";
import { PO_STAGES } from "@/lib/po-stages";
import {
  isOverdueAt,
  openAt,
  pointBreakdown,
  stageAt,
  stageSnapshotSeries,
} from "@/lib/analytics/stage-history";
import type {
  Snapshot,
  StageMove,
  StageOrder,
} from "@/lib/analytics/stage-history";

const at = (day: string) => new Date(`${day}T00:00:00+08:00`);

/** The bucket for `day`, which runs out when the next day opens. */
const snap = (day: string, end: string): Snapshot => ({
  key: day,
  label: day,
  end: at(end),
  day,
});

let nextId = 0;

/** A history, chained through `fromStage` the way the database records it. */
const history = (moves: [PoStage, string][]): StageMove[] =>
  moves.map(([toStage, day], i) => ({
    fromStage: i === 0 ? null : moves[i - 1][0],
    toStage,
    changedAt: at(day),
  }));

const order = (
  moves: [PoStage, string][],
  deliveryDate: string | null = null,
): StageOrder => ({
  id: `po${(nextId += 1)}`,
  deliveryDate,
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
      snap("2026-09-12", "2026-09-13"),
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
    day: key,
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

describe("stageSnapshotSeries, every stage", () => {
  it("counts every stage, zeros included, as things stand", () => {
    const [point] = stageSnapshotSeries(
      [
        order([placed("2026-09-10")]),
        order([placed("2026-09-10"), [PoStage.DELIVERING, "2026-09-11"]]),
        order([placed("2026-09-10"), [PoStage.DELIVERED, "2026-09-11"]]),
      ],
      [snap("2026-09-12", "2026-09-13")],
    );
    expect(
      Object.fromEntries(PO_STAGES.map((stage) => [stage, point[stage]])),
    ).toEqual({
      ORDER_PLACED: 1,
      IN_PRODUCTION: 0,
      QC_PASSED: 0,
      IN_WAREHOUSE: 0,
      DELIVERING: 1,
      DELIVERED: 0,
    });
    expect(point.total).toBe(2);
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
      id: "tie",
      deliveryDate: null,
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
    day: key,
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

  it("agrees with the orders open at that same instant, on every bar", () => {
    const points = stageSnapshotSeries(orders, snapshots);
    for (const [i, point] of points.entries()) {
      // Counted straight off `openAt`, the primitive, rather than off the
      // series again: two paths that have to agree, not one call made twice.
      const counts = new Map<PoStage, number>();
      for (const { stage } of openAt(orders, snapshots[i])) {
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      }
      expect(pointBreakdown(point).map((e) => [e.stage, e.count])).toEqual(
        PO_STAGES.filter((stage) => stage !== PoStage.DELIVERED).map(
          (stage) => [stage, counts.get(stage) ?? 0],
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

describe("isOverdueAt", () => {
  const o = (deliveryDate: string | null) =>
    order([placed("2026-09-01")], deliveryDate);

  it("is late only once the expected day has passed", () => {
    // Not on the day itself: "due today" is not lateness, and rounding the
    // other way would be the board rounding in its own favour.
    expect(isOverdueAt(o("2026-09-15"), "2026-09-14")).toBe(false);
    expect(isOverdueAt(o("2026-09-15"), "2026-09-15")).toBe(false);
    expect(isOverdueAt(o("2026-09-15"), "2026-09-16")).toBe(true);
  });

  it("is never late without an expected date", () => {
    // Null is not a zero: nobody committed to a date, so there is nothing to
    // be late against — and it is not counted as on time either.
    expect(isOverdueAt(o(null), "2030-01-01")).toBe(false);
  });
});

describe("overdue on the board", () => {
  const snapshots = ["2026-09-10", "2026-09-11", "2026-09-12"].map((key, i) =>
    snap(key, ["2026-09-11", "2026-09-12", "2026-09-13"][i]),
  );

  // One order goes late partway through the window, one never does.
  const orders = [
    order([placed("2026-09-10")], "2026-09-10"),
    order([placed("2026-09-10"), [PoStage.QC_PASSED, "2026-09-12"]], "2026-09-30"),
  ];

  it("counts the late share at the stage it is stuck at, day by day", () => {
    const points = stageSnapshotSeries(orders, snapshots);
    // Both open all three days; only the first is ever late, and it never
    // leaves Order placed.
    expect(points.map((p) => p.total)).toEqual([2, 2, 2]);
    expect(points.map((p) => p.lateTotal)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.late.ORDER_PLACED)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.late.QC_PASSED)).toEqual([0, 0, 0]);
  });

  it("never reports more late than the stage holds", () => {
    for (const point of stageSnapshotSeries(orders, snapshots)) {
      for (const stage of PO_STAGES) {
        expect(point.late[stage]).toBeLessThanOrEqual(point[stage]);
      }
    }
  });

  it("carries the late share into the legend", () => {
    const [, second] = stageSnapshotSeries(orders, snapshots);
    expect(
      pointBreakdown(second).map((e) => [e.stage, e.count, e.late]),
    ).toEqual([
      [PoStage.ORDER_PLACED, 2, 1],
      [PoStage.IN_PRODUCTION, 0, 0],
      [PoStage.QC_PASSED, 0, 0],
      [PoStage.IN_WAREHOUSE, 0, 0],
      [PoStage.DELIVERING, 0, 0],
    ]);
  });

  it("narrows every figure together when the filter is on", () => {
    const points = stageSnapshotSeries(orders, snapshots, "overdue");
    // The subject is the late orders, so the totals *are* the late counts —
    // a bar of two under a heading of one is the defect the filter exists to
    // avoid, and it is avoided by narrowing in `openAt` alone.
    expect(points.map((p) => p.total)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.lateTotal)).toEqual([0, 1, 1]);
    expect(points.map((p) => p.total)).toEqual(points.map((p) => p.lateTotal));
    expect(openAt(orders, snapshots[2], "overdue")).toHaveLength(1);
    expect(openAt(orders, snapshots[2])).toHaveLength(2);
  });
});
