import { WebOrderStatus } from "@/generated/prisma/enums";
import { dateColumnRange } from "@/lib/dates";
import { ORDER_IDENTITY_SELECT, orderIdentity } from "@/lib/order-identity";
import { prisma } from "@/lib/prisma";
import {
  boughtTogether,
  priceTrend,
  productStats,
  twelveMonthWindow,
  whoBuysIt,
  type CoProduct,
  type PricePoint,
  type ProductSaleRow,
  type ProductStats,
} from "@/lib/analytics/products";
import type { ShareSlice } from "@/lib/analytics/share";

const LATEST_ONLY = { supersededBy: { is: null } } as const;

export type OrderHistoryRow = {
  lineItemId: string;
  purchaseOrderId: string;
  /** Our Order ID; null on an uploaded scan. */
  orderId: string | null;
  /** The buyer's own PO number; null where they gave none. */
  poNumber: string | null;
  buyerId: string;
  buyerName: string;
  poDate: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  poTotal: number;
  stage: string;
  /** The list price in force on the day, for the billed-vs-list highlight. */
  listPriceThen: number;
};

export type ProductDetail = {
  product: {
    id: string;
    sku: string;
    name: string;
    category: string;
    unit: string;
    brand: string | null;
    variant: string | null;
    packSize: number | null;
    cartonsPerPallet: number | null;
    market: string | null;
    listPrice: number;
    /** Pieces on hand. Null where nobody has counted; ops-only. */
    stockPieces: number | null;
    description: string | null;
    active: boolean;
    needsReview: boolean;
    familyId: string | null;
    updatedAt: string;
  };
  /**
   * The product this is a variant of, with every sibling and the family's
   * own twelve-month figures (Phase 36). Null for a product placed in none.
   */
  family: {
    id: string;
    code: string;
    name: string;
    size: string | null;
    siblings: {
      id: string;
      sku: string;
      name: string;
      variant: string | null;
      market: string | null;
      active: boolean;
    }[];
    units: number;
    revenue: number;
    orders: number;
  } | null;
  /** What would be orphaned by a delete — the danger zone's whole argument. */
  references: { purchaseOrderLines: number; shopOrderLines: number };
  images: { id: string; url: string | null; position: number }[];
  stats: ProductStats;
  revenueShare: number;
  trend: PricePoint[];
  buyers: ShareSlice[];
  together: CoProduct[];
  history: OrderHistoryRow[];
  /**
   * Shop orders containing this product that nobody has confirmed yet
   * (Phase 38). The order history above reads confirmed purchase-order lines,
   * so demand sitting in the review queue was invisible here: a product in
   * five unconfirmed orders looked like a product nobody wanted.
   */
  openShopOrders: OpenShopOrderRow[];
  window: { from: Date; to: Date };
};

export type OpenShopOrderRow = {
  id: string;
  reference: string;
  buyerName: string;
  cartons: number;
  submittedAt: string | null;
};

/**
 * The stat tiles and the order-history table are the same rows and the same
 * window — one fetch, not one each. When they were two, the table had drifted
 * to 367 days against the tiles' 365 and the counts disagreed.
 */
export async function loadProduct(
  productId: string,
  presign: (key: string) => Promise<string>,
  now: Date = new Date(),
): Promise<ProductDetail | null> {
  const window = twelveMonthWindow(now);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      unit: true,
      brand: true,
      variant: true,
      packSize: true,
      cartonsPerPallet: true,
      market: true,
      listPrice: true,
      stockPieces: true,
      description: true,
      active: true,
      needsReview: true,
      familyId: true,
      family: {
        select: {
          id: true,
          code: true,
          name: true,
          size: true,
          products: {
            select: { id: true, sku: true, name: true, variant: true, market: true, active: true },
            orderBy: [{ variant: "asc" }, { market: "asc" }, { sku: "asc" }],
          },
        },
      },
      updatedAt: true,
      images: {
        orderBy: { position: "asc" },
        select: { id: true, r2Key: true, thumbKey: true, position: true },
      },
      prices: { orderBy: { from: "asc" }, select: { price: true, from: true } },
      // Every reference, not the twelve-month window the rest of this file
      // reads: what the danger zone needs to know is whether *anything*
      // anywhere points at this product (Phase 28 §4).
      _count: { select: { lineItems: true, webOrderLines: true } },
    },
  });
  if (!product) return null;

  const [lines, allLines, totalOrders, everyoneRevenue, names, familyLines, openShopLines] = await Promise.all([
    prisma.lineItem.findMany({
      where: {
        productId,
        purchaseOrder: {
          ...LATEST_ONLY,
          poDate: dateColumnRange(window),
        },
      },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        amount: true,
        purchaseOrder: {
          select: {
            id: true,
            ...ORDER_IDENTITY_SELECT,
            poDate: true,
            total: true,
            stage: true,
            buyerId: true,
            buyer: { select: { name: true } },
          },
        },
      },
      orderBy: { purchaseOrder: { poDate: "desc" } },
    }),
    // Every line on the same orders, for the bought-together card.
    prisma.lineItem.findMany({
      where: {
        productId: { not: null },
        purchaseOrder: {
          ...LATEST_ONLY,
          poDate: dateColumnRange(window),
        },
      },
      select: {
        productId: true,
        quantity: true,
        amount: true,
        purchaseOrder: {
          select: {
            id: true,
            poDate: true,
            buyerId: true,
            buyer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.purchaseOrder.count({
      where: { ...LATEST_ONLY, poDate: dateColumnRange(window) },
    }),
    prisma.purchaseOrder.aggregate({
      where: { ...LATEST_ONLY, poDate: dateColumnRange(window) },
      _sum: { total: true },
    }),
    prisma.product.findMany({ select: { id: true, name: true } }),
    // The whole family's sales in the same window — every variant, every
    // market — so the family card's figures and the tiles above it agree on
    // what twelve months means.
    product.familyId
      ? prisma.lineItem.findMany({
          where: {
            product: { familyId: product.familyId },
            purchaseOrder: { ...LATEST_ONLY, poDate: dateColumnRange(window) },
          },
          select: { quantity: true, amount: true, purchaseOrderId: true },
        })
      : Promise.resolve([]),
    // SUBMITTED or RECEIVED: a DRAFT is a client's live cart, and putting one
    // on an ops screen would show the team a basket nobody has sent. A
    // RECEIVED order is still open — the team has picked it up but not yet
    // confirmed it.
    prisma.webOrderLine.findMany({
      where: {
        productId,
        webOrder: {
          status: { in: [WebOrderStatus.SUBMITTED, WebOrderStatus.RECEIVED] },
        },
      },
      select: {
        cartons: true,
        webOrder: {
          select: {
            id: true,
            reference: true,
            submittedAt: true,
            buyer: { select: { name: true } },
          },
        },
      },
      orderBy: { webOrder: { submittedAt: "desc" } },
    }),
  ]);

  const rows: ProductSaleRow[] = lines.map((line) => ({
    purchaseOrderId: line.purchaseOrder.id,
    poDate: line.purchaseOrder.poDate,
    buyerId: line.purchaseOrder.buyerId,
    buyerName: line.purchaseOrder.buyer.name,
    productId,
    quantity: line.quantity.toNumber(),
    amount: line.amount.toNumber(),
  }));

  const allRows: ProductSaleRow[] = allLines
    .filter((line) => line.productId !== null)
    .map((line) => ({
      purchaseOrderId: line.purchaseOrder.id,
      poDate: line.purchaseOrder.poDate,
      buyerId: line.purchaseOrder.buyerId,
      buyerName: line.purchaseOrder.buyer.name,
      productId: line.productId!,
      quantity: line.quantity.toNumber(),
      amount: line.amount.toNumber(),
    }));

  const listPrice = product.listPrice.toNumber();

  /** The price in force on a given day, from the appended history. */
  const priceOn = (date: Date) => {
    let price = product.prices[0]?.price.toNumber() ?? listPrice;
    for (const entry of product.prices) {
      if (entry.from <= date) price = entry.price.toNumber();
      else break;
    }
    return price;
  };

  const images = await Promise.all(
    product.images.map(async (image) => {
      const key = image.thumbKey ?? image.r2Key;
      try {
        return { id: image.id, url: await presign(key), position: image.position };
      } catch {
        // R2 unreachable: the gallery shows its empty state rather than a
        // broken tile.
        return { id: image.id, url: null, position: image.position };
      }
    }),
  );

  const everyone = everyoneRevenue._sum.total?.toNumber() ?? 0;
  const stats = productStats(rows, listPrice, totalOrders, window, now);

  return {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      unit: product.unit,
      brand: product.brand,
      variant: product.variant,
      packSize: product.packSize,
      cartonsPerPallet: product.cartonsPerPallet,
      stockPieces: product.stockPieces,
      market: product.market,
      listPrice,
      description: product.description,
      active: product.active,
      needsReview: product.needsReview,
      familyId: product.familyId,
      updatedAt: product.updatedAt.toISOString(),
    },
    family: product.family
      ? {
          id: product.family.id,
          code: product.family.code,
          name: product.family.name,
          size: product.family.size,
          siblings: product.family.products,
          units: familyLines.reduce((sum, line) => sum + line.quantity.toNumber(), 0),
          revenue: familyLines.reduce((sum, line) => sum + line.amount.toNumber(), 0),
          orders: new Set(familyLines.map((line) => line.purchaseOrderId)).size,
        }
      : null,
    references: {
      purchaseOrderLines: product._count.lineItems,
      shopOrderLines: product._count.webOrderLines,
    },
    images,
    stats,
    revenueShare: everyone > 0 ? (stats.revenue / everyone) * 100 : 0,
    trend: priceTrend(rows, window),
    buyers: whoBuysIt(rows),
    together: boughtTogether(
      rows,
      allRows,
      new Map(names.map((entry) => [entry.id, entry.name])),
    ),
    openShopOrders: openShopLines.map((line) => ({
      id: line.webOrder.id,
      reference: line.webOrder.reference,
      buyerName: line.webOrder.buyer.name,
      cartons: line.cartons,
      submittedAt: line.webOrder.submittedAt?.toISOString() ?? null,
    })),
    history: lines.map((line) => ({
      lineItemId: line.id,
      purchaseOrderId: line.purchaseOrder.id,
      ...orderIdentity(line.purchaseOrder),
      buyerId: line.purchaseOrder.buyerId,
      buyerName: line.purchaseOrder.buyer.name,
      poDate: line.purchaseOrder.poDate.toISOString(),
      quantity: line.quantity.toNumber(),
      unitPrice: line.unitPrice.toNumber(),
      amount: line.amount.toNumber(),
      poTotal: line.purchaseOrder.total.toNumber(),
      stage: line.purchaseOrder.stage,
      listPriceThen: priceOn(line.purchaseOrder.poDate),
    })),
    window,
  };
}
