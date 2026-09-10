import { WebOrderStatus } from "@/generated/prisma/enums";
import { lineTotal, piecesFor } from "@/lib/cartons";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { thumbUrl } from "@/lib/queries/shop-catalogue";

export type CartLine = {
  productId: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  packSize: number | null;
  unit: string;
  cartons: number;
  /** Today's price, read on every render. Never taken from the stored line. */
  unitPrice: string;
  amount: string;
  pieces: number | null;
  imageUrl: string | null;
  /** True where the product has since left the shop — priced out or archived. */
  unavailable: boolean;
};

export type Cart = {
  id: string | null;
  lines: CartLine[];
  subtotal: string;
  cartonCount: number;
};

export const EMPTY_CART: Cart = {
  id: null,
  lines: [],
  subtotal: "0.00",
  cartonCount: 0,
};

export type CartSummary = {
  count: number;
  cartonCount: number;
  subtotal: string;
  lines: { productId: string; cartons: number }[];
};

export const EMPTY_CART_SUMMARY: CartSummary = {
  count: 0,
  cartonCount: 0,
  subtotal: "0.00",
  lines: [],
};

/**
 * What every priced line needs from its product — shared by `loadCart`,
 * `cartSummary` and (Task 5) the guest cart's `priceCart`, so the three price
 * exactly the same way from exactly the same columns.
 */
export const PRICED_PRODUCT_SELECT = {
  sku: true,
  name: true,
  brand: true,
  variant: true,
  packSize: true,
  unit: true,
  listPrice: true,
  active: true,
  needsReview: true,
  images: {
    take: 1,
    orderBy: { position: "asc" },
    select: { thumbKey: true, r2Key: true },
  },
} satisfies Prisma.ProductSelect;

export type PricedProductRow = Prisma.ProductGetPayload<{
  select: typeof PRICED_PRODUCT_SELECT;
}>;

/**
 * Prices a set of {product, cartons} rows at today's list price. The body of
 * `loadCart`'s old map/filter/reduce, lifted out so a guest cart (Task 5,
 * which has no `WebOrder` row to read) prices identically to a client's.
 *
 * Async because the thumbnail is a signed R2 GET, not a stored URL.
 */
export async function priceProductLines(
  rows: { productId: string; cartons: number; product: PricedProductRow }[],
): Promise<{ lines: CartLine[]; subtotal: string; cartonCount: number }> {
  const priced = await Promise.all(
    rows.map(async (row) => {
      const price = row.product.listPrice.toFixed(2);
      const line: CartLine = {
        productId: row.productId,
        sku: row.product.sku,
        name: row.product.name,
        brand: row.product.brand,
        variant: row.product.variant,
        packSize: row.product.packSize,
        unit: row.product.unit,
        cartons: row.cartons,
        unitPrice: price,
        amount: lineTotal(row.cartons, price),
        pieces: piecesFor(row.cartons, row.product.packSize),
        imageUrl: await thumbUrl(row.product.images),
        unavailable:
          !row.product.active ||
          row.product.needsReview ||
          row.product.listPrice.lessThanOrEqualTo(0),
      };
      return line;
    }),
  );

  const lines = priced.sort(
    (a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku),
  );

  // Unavailable lines are shown but never counted: the client must be able to
  // see and remove one, and must not be quoted a total that includes it.
  const subtotal = lines
    .filter((line) => !line.unavailable)
    .reduce((sum, line) => sum.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    lines,
    subtotal,
    cartonCount: lines.reduce((sum, line) => sum + line.cartons, 0),
  };
}

/**
 * The client's open cart, priced at today's list price.
 *
 * **The cart stores product ids and cartons and nothing else.** The price is
 * joined on every read, so what the client sees is always current and a stale
 * price is not merely unlikely — it is unrepresentable. `submitWebOrder`
 * snapshots the price into the line inside its transaction, and only then.
 */
export async function loadCart(placedById: string): Promise<Cart> {
  const order = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: {
      id: true,
      lines: {
        select: {
          productId: true,
          cartons: true,
          product: { select: PRICED_PRODUCT_SELECT },
        },
      },
    },
  });
  if (!order) return EMPTY_CART;

  const { lines, subtotal, cartonCount } = await priceProductLines(order.lines);
  return { id: order.id, lines, subtotal, cartonCount };
}

/** Just the badge on the shop header, without loading every product. */
export async function cartCount(placedById: string): Promise<number> {
  const order = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: { _count: { select: { lines: true } } },
  });
  return order?._count.lines ?? 0;
}

/**
 * The cart, priced, without the full `CartLine` shape — what `ShopHeader` and
 * `ShopUtilityBar` (Task 7) need to show a total without loading images they
 * will not render.
 */
export async function cartSummary(placedById: string): Promise<CartSummary> {
  const order = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: {
      lines: {
        select: {
          productId: true,
          cartons: true,
          product: { select: PRICED_PRODUCT_SELECT },
        },
      },
    },
  });
  if (!order) return EMPTY_CART_SUMMARY;

  const { lines, subtotal, cartonCount } = await priceProductLines(order.lines);
  return {
    count: lines.length,
    cartonCount,
    subtotal,
    lines: lines.map((line) => ({ productId: line.productId, cartons: line.cartons })),
  };
}
