import "server-only";
import { prisma } from "@/lib/prisma";
import type { StockCountRow } from "@/lib/stock";

const iso = (value: Date) => value.toISOString().slice(0, 10);

/** The narrow select every read here uses. Stock never reaches the shop. */
const COUNT_SELECT = {
  id: true,
  countedOn: true,
  cartons: true,
  note: true,
  createdAt: true,
  supersedesId: true,
  supersededBy: { select: { id: true } },
  countedBy: { select: { name: true, image: true } },
} as const;

type Raw = {
  id: string;
  countedOn: Date;
  cartons: number;
  note: string | null;
  createdAt: Date;
  supersedesId: string | null;
  supersededBy: { id: string } | null;
  countedBy: { name: string; image: string | null } | null;
};

const toRow = (row: Raw): StockCountRow => ({
  id: row.id,
  countedOn: iso(row.countedOn),
  cartons: row.cartons,
  note: row.note,
  countedByName: row.countedBy?.name ?? null,
  countedByImage: row.countedBy?.image ?? null,
  createdAt: row.createdAt.toISOString(),
  supersedesId: row.supersedesId,
  supersededById: row.supersededBy?.id ?? null,
});

/** Every count for one product — its trend, its history and its corrections. */
export async function loadProductStock(productId: string): Promise<StockCountRow[]> {
  const rows = await prisma.stockCount.findMany({
    where: { productId },
    select: COUNT_SELECT,
    orderBy: { countedOn: "asc" },
  });
  return rows.map(toRow);
}

export type StockSheetRow = {
  id: string;
  name: string;
  sku: string;
  market: string | null;
  stockCartons: number | null;
  lastCountedOn: string | null;
};

/**
 * The stocktake sheet: every active product with what it last read and when.
 * `countedOn` comes from the ledger rather than from the cached column, which
 * knows the figure but not the day.
 */
export async function loadStockSheet(query?: string): Promise<StockSheetRow[]> {
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { sku: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      market: true,
      stockCartons: true,
      stockCounts: {
        where: { supersededBy: { is: null } },
        orderBy: { countedOn: "desc" },
        take: 1,
        select: { countedOn: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    market: product.market,
    stockCartons: product.stockCartons,
    lastCountedOn: product.stockCounts[0] ? iso(product.stockCounts[0].countedOn) : null,
  }));
}

export type StockMovementRow = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  beforeCartons: number;
  afterCartons: number;
  purchaseOrderId: string;
  poNumber: string | null;
  reason: string;
  actorName: string | null;
  createdAt: string;
};

const MOVEMENT_SELECT = {
  id: true,
  productId: true,
  quantity: true,
  beforeCartons: true,
  afterCartons: true,
  purchaseOrderId: true,
  poNumber: true,
  reason: true,
  createdAt: true,
  actor: { select: { name: true } },
  product: { select: { name: true } },
} as const;

type RawMovement = {
  id: string;
  productId: string;
  quantity: number;
  beforeCartons: number;
  afterCartons: number;
  purchaseOrderId: string;
  poNumber: string | null;
  reason: string;
  createdAt: Date;
  actor: { name: string } | null;
  product: { name: string };
};

const toMovement = (row: RawMovement): StockMovementRow => ({
  id: row.id,
  productId: row.productId,
  productName: row.product.name,
  quantity: row.quantity,
  beforeCartons: row.beforeCartons,
  afterCartons: row.afterCartons,
  purchaseOrderId: row.purchaseOrderId,
  poNumber: row.poNumber,
  reason: row.reason,
  actorName: row.actor?.name ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Deductions for one product, newest first. The stocktake feed does not include these. */
export async function loadProductMovements(productId: string): Promise<StockMovementRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { productId },
    select: MOVEMENT_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toMovement);
}

/** Recent deductions across the catalogue, newest first. */
export async function loadRecentMovements(take = 20): Promise<StockMovementRow[]> {
  const rows = await prisma.stockMovement.findMany({
    select: MOVEMENT_SELECT,
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map(toMovement);
}

export type StockFeedEntry = StockCountRow & { productId: string; productName: string };

/** Recent counting across the whole catalogue, newest work first. */
export async function loadStockFeed(take = 20): Promise<StockFeedEntry[]> {
  const rows = await prisma.stockCount.findMany({
    select: { ...COUNT_SELECT, productId: true, product: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return rows.map((row) => ({
    ...toRow(row),
    productId: row.productId,
    productName: row.product.name,
  }));
}
