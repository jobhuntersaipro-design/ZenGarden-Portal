import { WebOrderStatus } from "@/generated/prisma/enums";
import { lineTotal, piecesFor } from "@/lib/cartons";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

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
          product: {
            select: {
              sku: true,
              name: true,
              brand: true,
              variant: true,
              packSize: true,
              unit: true,
              listPrice: true,
              active: true,
              needsReview: true,
            },
          },
        },
      },
    },
  });
  if (!order) return EMPTY_CART;

  const lines: CartLine[] = order.lines
    .map((line) => {
      const price = line.product.listPrice.toFixed(2);
      return {
        productId: line.productId,
        sku: line.product.sku,
        name: line.product.name,
        brand: line.product.brand,
        variant: line.product.variant,
        packSize: line.product.packSize,
        unit: line.product.unit,
        cartons: line.cartons,
        unitPrice: price,
        amount: lineTotal(line.cartons, price),
        pieces: piecesFor(line.cartons, line.product.packSize),
        unavailable:
          !line.product.active ||
          line.product.needsReview ||
          line.product.listPrice.lessThanOrEqualTo(0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));

  // Unavailable lines are shown but never counted: the client must be able to
  // see and remove one, and must not be quoted a total that includes it.
  const subtotal = lines
    .filter((line) => !line.unavailable)
    .reduce((sum, line) => sum.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    id: order.id,
    lines,
    subtotal,
    cartonCount: lines.reduce((sum, line) => sum + line.cartons, 0),
  };
}

/** Just the badge on the shop header, without loading every product. */
export async function cartCount(placedById: string): Promise<number> {
  const order = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: { _count: { select: { lines: true } } },
  });
  return order?._count.lines ?? 0;
}
