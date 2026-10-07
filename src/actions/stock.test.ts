import { beforeEach, describe, expect, it, vi } from "vitest";

type CountRow = {
  id: string;
  productId: string;
  countedOn: Date;
  cartons: number;
  createdAt: Date;
  supersedesId: string | null;
  superseded: boolean;
};

type Move = { productId: string; quantity: number; createdAt: Date };

const counts: CountRow[] = [];
const moves: Move[] = [];
let now = new Date("2026-09-12T01:00:00.000Z");
let seq = 0;

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);
const sameInstant = (a: Date, b: Date) => a.getTime() === b.getTime();

const queryRaw = vi.fn<(query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>>(
  async () => [],
);
const productUpdate = vi.fn();
const requirePermission = vi.fn();

const stockFindMany = vi.fn(
  async (args: {
    where: { productId: { in: string[] }; countedOn: Date };
  }) =>
    counts
      .filter(
        (row) =>
          args.where.productId.in.includes(row.productId) &&
          sameInstant(row.countedOn, args.where.countedOn) &&
          !row.superseded,
      )
      .map((row) => ({ id: row.id, productId: row.productId })),
);

const stockFindFirst = vi.fn(
  async (args: {
    where: { productId: string; countedOn?: Date; supersededBy?: { is: null } };
    orderBy:
      | { countedOn?: "desc"; createdAt?: "asc" | "desc" }
      | { countedOn?: "desc"; createdAt?: "asc" | "desc" }[];
  }) => {
    let rows = counts.filter((row) => row.productId === args.where.productId);
    if (args.where.supersededBy) rows = rows.filter((row) => !row.superseded);
    if (args.where.countedOn) {
      const countedOn = args.where.countedOn;
      rows = rows.filter((row) => sameInstant(row.countedOn, countedOn));
    }
    const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy];
    rows.sort((a, b) => {
      for (const key of order) {
        if (key.countedOn === "desc" && a.countedOn.getTime() !== b.countedOn.getTime()) {
          return b.countedOn.getTime() - a.countedOn.getTime();
        }
        if (key.createdAt === "desc" && a.createdAt.getTime() !== b.createdAt.getTime()) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        if (key.createdAt === "asc" && a.createdAt.getTime() !== b.createdAt.getTime()) {
          return a.createdAt.getTime() - b.createdAt.getTime();
        }
      }
      return 0;
    });
    const row = rows[0];
    if (!row) return null;
    return { cartons: row.cartons, createdAt: row.createdAt, countedOn: row.countedOn };
  },
);

const stockCreate = vi.fn(
  async (args: {
    data: {
      productId: string;
      countedOn: Date;
      cartons: number;
      note: string | null;
      countedById: string;
      supersedesId: string | null;
    };
  }) => {
    const data = args.data;
    if (data.supersedesId) {
      const previous = counts.find((row) => row.id === data.supersedesId);
      if (previous) previous.superseded = true;
    }
    counts.push({
      id: `c${++seq}`,
      productId: data.productId,
      countedOn: data.countedOn,
      cartons: data.cartons,
      createdAt: new Date(now),
      supersedesId: data.supersedesId,
      superseded: false,
    });
  },
);

const movementAggregate = vi.fn(
  async (args: { where: { productId: string; createdAt: { gt: Date } } }) => {
    const sum = moves
      .filter(
        (row) =>
          row.productId === args.where.productId &&
          row.createdAt.getTime() > args.where.createdAt.gt.getTime(),
      )
      .reduce((total, row) => total + row.quantity, 0);
    return { _sum: { quantity: sum === 0 ? null : sum } };
  },
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $queryRaw: queryRaw,
        stockCount: { findMany: stockFindMany, findFirst: stockFindFirst, create: stockCreate },
        stockMovement: { aggregate: movementAggregate },
        product: { update: productUpdate },
      }),
  },
}));
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/lib/permissions/require", () => ({ requirePermission }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveStockCounts } = await import("@/actions/stock");

const seedCount = (
  over: Partial<CountRow> & Pick<CountRow, "countedOn" | "cartons" | "createdAt">,
) => {
  counts.push({
    id: over.id ?? `seed${++seq}`,
    productId: over.productId ?? "p1",
    countedOn: over.countedOn,
    cartons: over.cartons,
    createdAt: over.createdAt,
    supersedesId: over.supersedesId ?? null,
    superseded: over.superseded ?? false,
  });
};

beforeEach(() => {
  counts.splice(0, counts.length);
  moves.splice(0, moves.length);
  now = new Date("2026-09-12T01:00:00.000Z");
  seq = 0;
  vi.clearAllMocks();
  requirePermission.mockResolvedValue({ id: "usr1" });
});

const input = {
  countedOn: "2026-09-12",
  note: "Back shelf only",
  entries: [{ productId: "p1", cartons: 40 }],
};

const cutoffOf = () =>
  movementAggregate.mock.calls.at(-1)?.[0].where.createdAt.gt as Date;

const cached = () => productUpdate.mock.calls.at(-1)?.[0].data.stockCartons as number;

describe("saveStockCounts", () => {
  it("writes a count with its author, its day and its note", async () => {
    const result = await saveStockCounts(input);
    expect(result).toMatchObject({ success: true });
    expect(stockCreate.mock.calls[0][0].data).toEqual({
      productId: "p1",
      countedOn: new Date("2026-09-12T00:00:00.000Z"),
      cartons: 40,
      note: "Back shelf only",
      countedById: "usr1",
      supersedesId: null,
    });
  });

  /** `@db.Date` truncates in UTC, so a KL count must not land the day before. */
  it("stores the day as UTC midnight", async () => {
    await saveStockCounts(input);
    const stored = stockCreate.mock.calls[0][0].data.countedOn as Date;
    expect(stored.toISOString()).toBe("2026-09-12T00:00:00.000Z");
  });

  it("supersedes the standing count for a day already counted", async () => {
    seedCount({
      id: "old",
      countedOn: day("2026-09-12"),
      cartons: 12,
      createdAt: at("2026-09-12T00:30:00.000Z"),
    });
    const result = await saveStockCounts(input);
    expect(stockCreate.mock.calls[0][0].data.supersedesId).toBe("old");
    expect(result).toMatchObject({ success: true, data: { saved: 1, corrected: 1 } });
  });

  /**
   * The cache is rewritten from the ledger, never from what was just typed:
   * correcting a past day must leave the current figure alone.
   */
  it("rewrites Product.stockCartons from the ledger, not from the entry", async () => {
    seedCount({
      countedOn: day("2026-09-20"),
      cartons: 80,
      createdAt: at("2026-09-20T02:00:00.000Z"),
    });
    await saveStockCounts(input);
    expect(productUpdate.mock.calls[0][0]).toEqual({
      where: { id: "p1" },
      data: { stockCartons: 80 },
    });
  });

  it("with no deliveries the cache is the latest count", async () => {
    await saveStockCounts(input);
    expect(cutoffOf().toISOString()).toBe("2026-09-12T01:00:00.000Z");
    expect(cached()).toBe(40);
  });

  it("does not subtract a delivery that happened before a fresh recount", async () => {
    seedCount({
      countedOn: day("2026-10-01"),
      cartons: 100,
      createdAt: at("2026-10-01T02:00:00.000Z"),
    });
    moves.push({
      productId: "p1",
      quantity: 10,
      createdAt: at("2026-10-03T02:00:00.000Z"),
    });
    now = at("2026-10-05T02:00:00.000Z");
    await saveStockCounts({
      countedOn: "2026-10-05",
      note: null,
      entries: [{ productId: "p1", cartons: 80 }],
    });
    expect(cutoffOf().toISOString()).toBe("2026-10-05T02:00:00.000Z");
    expect(cached()).toBe(80);
  });

  it("keeps the delivery when the latest day is corrected afterwards", async () => {
    seedCount({
      id: "oct1",
      countedOn: day("2026-10-01"),
      cartons: 100,
      createdAt: at("2026-10-01T02:00:00.000Z"),
    });
    moves.push({
      productId: "p1",
      quantity: 10,
      createdAt: at("2026-10-03T02:00:00.000Z"),
    });
    now = at("2026-10-05T02:00:00.000Z");
    await saveStockCounts({
      countedOn: "2026-10-01",
      note: null,
      entries: [{ productId: "p1", cartons: 101 }],
    });
    expect(cutoffOf().toISOString()).toBe("2026-10-01T02:00:00.000Z");
    expect(cached()).toBe(91);
  });

  it("subtracts a delivery after a backdated count that becomes the latest", async () => {
    seedCount({
      countedOn: day("2026-10-01"),
      cartons: 100,
      createdAt: at("2026-10-01T02:00:00.000Z"),
    });
    moves.push({
      productId: "p1",
      quantity: 10,
      createdAt: at("2026-10-03T02:00:00.000Z"),
    });
    now = at("2026-10-05T02:00:00.000Z");
    await saveStockCounts({
      countedOn: "2026-10-02",
      note: null,
      entries: [{ productId: "p1", cartons: 95 }],
    });
    expect(cutoffOf().toISOString()).toBe("2026-10-02T16:00:00.000Z");
    expect(cached()).toBe(85);
  });

  it("does not restore cartons when an older day is entered after a delivery", async () => {
    seedCount({
      countedOn: day("2026-10-01"),
      cartons: 100,
      createdAt: at("2026-10-01T02:00:00.000Z"),
    });
    moves.push({
      productId: "p1",
      quantity: 10,
      createdAt: at("2026-10-03T02:00:00.000Z"),
    });
    now = at("2026-10-05T02:00:00.000Z");
    await saveStockCounts({
      countedOn: "2026-09-28",
      note: null,
      entries: [{ productId: "p1", cartons: 50 }],
    });
    expect(cutoffOf().toISOString()).toBe("2026-10-01T02:00:00.000Z");
    expect(cached()).toBe(90);
  });

  it("locks product rows in id order before it reads deliveries", async () => {
    await saveStockCounts({
      countedOn: "2026-09-12",
      note: null,
      entries: [
        { productId: "p2", cartons: 1 },
        { productId: "p1", cartons: 2 },
      ],
    });
    const call = queryRaw.mock.calls[0];
    if (!call) throw new Error("products were not locked");
    const [strings, ids] = call;
    expect(strings.join(" ")).toContain("ANY");
    expect(strings.join(" ")).toContain('ORDER BY "id"');
    expect(strings.join(" ")).toContain("FOR UPDATE");
    expect(ids).toEqual(["p1", "p2"]);
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      movementAggregate.mock.invocationCallOrder[0],
    );
  });

  it("refuses a negative count, and writes nothing", async () => {
    const result = await saveStockCounts({
      ...input,
      entries: [{ productId: "p1", cartons: -1 }],
    });
    expect(result).toMatchObject({ success: false });
    expect(stockCreate).not.toHaveBeenCalled();
  });

  it("refuses a count of nothing at all", async () => {
    const result = await saveStockCounts({ ...input, entries: [] });
    expect(result).toMatchObject({ success: false, error: "Nothing was counted" });
    expect(stockCreate).not.toHaveBeenCalled();
  });

  it("takes zero as a real count", async () => {
    await saveStockCounts({ ...input, entries: [{ productId: "p1", cartons: 0 }] });
    expect(stockCreate.mock.calls[0][0].data.cartons).toBe(0);
  });
});
