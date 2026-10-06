import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { OUT_FOR_DELIVERY_REASON } from "@/lib/delivery-stock";

/**
 * In-memory stand-in for the delivery transaction. `$transaction` runs one
 * callback at a time: that is `SELECT … FOR UPDATE` on the purchase order,
 * held until the stage change commits. A throw restores the snapshot, which
 * is what Postgres does with the real transaction.
 */
type Line = {
  id: string;
  position: number;
  description: string;
  quantity: Prisma.Decimal;
  productId: string | null;
  product: { id: string; name: string; variant: string | null } | null;
};

type Po = {
  id: string;
  poNumber: string | null;
  stage: string;
  stockDeductedAt: Date | null;
  lineItems: Line[];
};

type ProductRow = {
  id: string;
  name: string;
  variant: string | null;
  stockCartons: number | null;
};

type Movement = {
  productId: string;
  purchaseOrderId: string;
  lineItemId: string;
  quantity: number;
  beforeCartons: number;
  afterCartons: number;
  poNumber: string | null;
  reason: string;
  actorId: string;
};

const pos = new Map<string, Po>();
const products = new Map<string, ProductRow>();
const movements: Movement[] = [];
const events: { fromStage: string; toStage: string; changedById: string }[] = [];

const cloneLine = (line: Line): Line => ({
  ...line,
  quantity: new Prisma.Decimal(line.quantity.toString()),
  product: line.product ? { ...line.product } : null,
});

const snapshot = () => ({
  pos: [...pos.entries()].map(([id, po]) => [
    id,
    {
      ...po,
      stockDeductedAt: po.stockDeductedAt ? new Date(po.stockDeductedAt) : null,
      lineItems: po.lineItems.map(cloneLine),
    },
  ]) as [string, Po][],
  products: [...products.entries()].map(([id, row]) => [id, { ...row }]) as [string, ProductRow][],
  movements: movements.map((row) => ({ ...row })),
  events: events.map((row) => ({ ...row })),
});

const restore = (saved: ReturnType<typeof snapshot>) => {
  pos.clear();
  for (const [id, po] of saved.pos) pos.set(id, po);
  products.clear();
  for (const [id, row] of saved.products) products.set(id, row);
  movements.splice(0, movements.length, ...saved.movements);
  events.splice(0, events.length, ...saved.events);
};

let chain: Promise<unknown> = Promise.resolve();

const tx = {
  $queryRaw: vi.fn(async () => []),
  purchaseOrder: {
    findUnique: vi.fn(async (args: { where: { id: string }; select?: { lineItems?: unknown } }) => {
      const po = pos.get(args.where.id);
      if (!po) return null;
      return {
        id: po.id,
        poNumber: po.poNumber,
        stage: po.stage,
        stockDeductedAt: po.stockDeductedAt,
        lineItems: po.lineItems.map(cloneLine),
      };
    }),
    updateMany: vi.fn(
      async (args: {
        where: { id: string; stage?: string; stockDeductedAt?: null };
        data: { stage?: string; stageChangedAt?: Date; stockDeductedAt?: Date };
      }) => {
        const po = pos.get(args.where.id);
        if (!po) return { count: 0 };
        if (args.where.stage !== undefined && po.stage !== args.where.stage) return { count: 0 };
        if (args.where.stockDeductedAt === null) {
          if (po.stockDeductedAt !== null) return { count: 0 };
          po.stockDeductedAt = args.data.stockDeductedAt ?? new Date();
          return { count: 1 };
        }
        if (args.data.stage) po.stage = args.data.stage;
        return { count: 1 };
      },
    ),
  },
  product: {
    findMany: vi.fn(async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => products.get(id)).filter((row) => row !== undefined),
    ),
    updateMany: vi.fn(
      async (args: { where: { id: string; stockCartons: number }; data: { stockCartons: number } }) => {
        const row = products.get(args.where.id);
        if (!row || row.stockCartons !== args.where.stockCartons) return { count: 0 };
        row.stockCartons = args.data.stockCartons;
        return { count: 1 };
      },
    ),
  },
  stockMovement: {
    createMany: vi.fn(async (args: { data: Movement[] }) => {
      for (const row of args.data) {
        if (
          movements.some(
            (existing) =>
              existing.purchaseOrderId === row.purchaseOrderId &&
              existing.lineItemId === row.lineItemId,
          )
        ) {
          const error = new Error("Unique constraint failed");
          (error as { code?: string }).code = "P2002";
          throw error;
        }
        movements.push({ ...row });
      }
      return { count: args.data.length };
    }),
  },
  poStageEvent: {
    create: vi.fn(async (args: { data: { fromStage: string; toStage: string; changedById: string } }) => {
      events.push({
        fromStage: args.data.fromStage,
        toStage: args.data.toStage,
        changedById: args.data.changedById,
      });
    }),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    purchaseOrder: {
      findUnique: (args: { where: { id: string } }) => tx.purchaseOrder.findUnique(args),
    },
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => {
      const run = chain.then(async () => {
        const saved = snapshot();
        try {
          return await fn(tx);
        } catch (error) {
          restore(saved);
          throw error;
        }
      });
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  },
}));

vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireUser: vi.fn(),
}));
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    email: "a@b.com",
    name: "Aisha Rahman",
    image: null,
    role: "WAREHOUSE",
    mustChangePassword: false,
  })),
  rolesWithPermission: vi.fn(async () => ["WAREHOUSE"]),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/web-order-document", () => ({
  attachWebOrderDocument: vi.fn(),
  readStoredWebOrderDocument: vi.fn(),
}));
vi.mock("@/lib/po-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/po-email")>();
  return { ...actual, preparePoEmail: vi.fn() };
});

const { advanceStage, revertStage } = await import("@/actions/stages");

const product = (
  id: string,
  name: string,
  stockCartons: number | null,
  variant: string | null = null,
): ProductRow => ({ id, name, variant, stockCartons });

const poLine = (
  id: string,
  productId: string | null,
  quantity: string,
  position = 0,
  description = "ZEN 2.1L — Goat's Milk",
): Line => {
  const row = productId ? products.get(productId) : undefined;
  return {
    id,
    position,
    description,
    quantity: new Prisma.Decimal(quantity),
    productId,
    product: row ? { id: row.id, name: row.name, variant: row.variant } : null,
  };
};

const seedOrder = (lines: Line[], stage = "IN_WAREHOUSE", id = "po-1") => {
  pos.set(id, {
    id,
    poNumber: "PO-100",
    stage,
    stockDeductedAt: null,
    lineItems: lines,
  });
};

beforeEach(() => {
  pos.clear();
  products.clear();
  movements.splice(0, movements.length);
  events.splice(0, events.length);
  chain = Promise.resolve();
  products.set("p-goat", product("p-goat", "ZEN 2.1L — Goat's Milk", 10, "Goat's Milk"));
  products.set("p-lav", product("p-lav", "ZEN 2.1L — Lavender", 8, "Lavender"));
});

describe("advance to Delivering deducts stock once", () => {
  it("deducts each line once and writes a log row", async () => {
    seedOrder([poLine("l1", "p-goat", "3")]);
    const result = await advanceStage("po-1", "Left the dock");
    expect(result).toEqual({ success: true, data: { stage: "DELIVERING" } });
    expect(products.get("p-goat")?.stockCartons).toBe(7);
    expect(pos.get("po-1")?.stockDeductedAt).toBeInstanceOf(Date);
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      productId: "p-goat",
      purchaseOrderId: "po-1",
      lineItemId: "l1",
      quantity: 3,
      beforeCartons: 10,
      afterCartons: 7,
      poNumber: "PO-100",
      reason: OUT_FOR_DELIVERY_REASON,
      actorId: "user-1",
    });
    expect(events).toEqual([
      { fromStage: "IN_WAREHOUSE", toStage: "DELIVERING", changedById: "user-1" },
    ]);
  });

  it("deducts every line of an order, including two lines of one product", async () => {
    seedOrder([
      poLine("l1", "p-goat", "3", 0),
      poLine("l2", "p-goat", "4", 1),
      poLine("l3", "p-lav", "2", 2, "ZEN 2.1L — Lavender"),
    ]);
    const result = await advanceStage("po-1");
    expect(result.success).toBe(true);
    expect(products.get("p-goat")?.stockCartons).toBe(3);
    expect(products.get("p-lav")?.stockCartons).toBe(6);
    expect(movements.map((row) => [row.lineItemId, row.quantity, row.beforeCartons, row.afterCartons])).toEqual([
      ["l1", 3, 10, 7],
      ["l2", 4, 7, 3],
      ["l3", 2, 8, 6],
    ]);
  });

  it("does not deduct again when the order is moved back and forward", async () => {
    seedOrder([poLine("l1", "p-goat", "3")]);
    await advanceStage("po-1");
    const reverted = await revertStage("po-1", "Truck turned around");
    expect(reverted).toEqual({ success: true, data: { stage: "IN_WAREHOUSE" } });
    expect(products.get("p-goat")?.stockCartons).toBe(7);
    const again = await advanceStage("po-1");
    expect(again).toEqual({ success: true, data: { stage: "DELIVERING" } });
    expect(products.get("p-goat")?.stockCartons).toBe(7);
    expect(movements).toHaveLength(1);
    expect(pos.get("po-1")?.stockDeductedAt).toBeInstanceOf(Date);
  });

  it("deducts once when two moves run together", async () => {
    seedOrder([poLine("l1", "p-goat", "3")]);
    const [first, second] = await Promise.all([advanceStage("po-1"), advanceStage("po-1")]);
    const results = [first, second];
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success).map((result) => result.error)).toEqual([
      "This order was already moved. Refresh.",
    ]);
    expect(products.get("p-goat")?.stockCartons).toBe(7);
    expect(movements).toHaveLength(1);
    expect(pos.get("po-1")?.stage).toBe("DELIVERING");
  });

  it("blocks a short order and changes nothing", async () => {
    products.get("p-goat")!.stockCartons = 1;
    seedOrder([
      poLine("l1", "p-goat", "3", 0),
      poLine("l2", "p-lav", "2", 1, "ZEN 2.1L — Lavender"),
    ]);
    const result = await advanceStage("po-1");
    expect(result).toEqual({
      success: false,
      error:
        "Not enough stock to mark this order out for delivery. ZEN 2.1L — Goat's Milk needs 3 cartons, 1 available.",
    });
    expect(pos.get("po-1")?.stage).toBe("IN_WAREHOUSE");
    expect(pos.get("po-1")?.stockDeductedAt).toBeNull();
    expect(products.get("p-goat")?.stockCartons).toBe(1);
    expect(products.get("p-lav")?.stockCartons).toBe(8);
    expect(movements).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it("names every product that is short", async () => {
    products.get("p-goat")!.stockCartons = 1;
    products.get("p-lav")!.stockCartons = 0;
    seedOrder([
      poLine("l1", "p-goat", "3", 0),
      poLine("l2", "p-lav", "2", 1, "ZEN 2.1L — Lavender"),
    ]);
    const result = await advanceStage("po-1");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe(
      "Not enough stock to mark this order out for delivery. ZEN 2.1L — Goat's Milk needs 3 cartons, 1 available. ZEN 2.1L — Lavender needs 2 cartons, 0 available.",
    );
    expect(pos.get("po-1")?.stage).toBe("IN_WAREHOUSE");
    expect(movements).toHaveLength(0);
  });

  it("does not deduct when a different stage is advanced", async () => {
    seedOrder([poLine("l1", "p-goat", "3")], "ORDER_PLACED");
    const result = await advanceStage("po-1");
    expect(result).toEqual({ success: true, data: { stage: "IN_PRODUCTION" } });
    expect(products.get("p-goat")?.stockCartons).toBe(10);
    expect(movements).toHaveLength(0);
    expect(pos.get("po-1")?.stockDeductedAt).toBeNull();
  });

  it("rolls the deduction back when the stage write loses", async () => {
    seedOrder([poLine("l1", "p-goat", "3")]);
    const original = tx.purchaseOrder.updateMany.getMockImplementation();
    tx.purchaseOrder.updateMany.mockImplementation(async (args) => {
      if (args.where.stockDeductedAt === null) {
        const po = pos.get(args.where.id);
        if (!po || po.stockDeductedAt !== null || po.stage !== args.where.stage) return { count: 0 };
        po.stockDeductedAt = args.data.stockDeductedAt ?? new Date();
        return { count: 1 };
      }
      return { count: 0 };
    });
    try {
      const result = await advanceStage("po-1");
      expect(result).toEqual({
        success: false,
        error: "Stock changed while this order was moving. Refresh and try again.",
      });
      expect(products.get("p-goat")?.stockCartons).toBe(10);
      expect(pos.get("po-1")?.stage).toBe("IN_WAREHOUSE");
      expect(pos.get("po-1")?.stockDeductedAt).toBeNull();
      expect(movements).toHaveLength(0);
    } finally {
      if (original) tx.purchaseOrder.updateMany.mockImplementation(original);
    }
  });
});
