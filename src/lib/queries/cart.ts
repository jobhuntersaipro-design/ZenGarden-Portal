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
const PRICED_PRODUCT_FIELDS = {
  sku: true,
  name: true,
  brand: true,
  variant: true,
  packSize: true,
  unit: true,
  listPrice: true,
  active: true,
  needsReview: true,
} satisfies Prisma.ProductSelect;

export const PRICED_PRODUCT_SELECT = {
  ...PRICED_PRODUCT_FIELDS,
  images: {
    take: 1,
    orderBy: { position: "asc" },
    select: { thumbKey: true, r2Key: true },
  },
} satisfies Prisma.ProductSelect;

/**
 * The same fields, without `images` — for a caller (`cartSummary`) that
 * needs the money and availability but never renders a thumbnail. Selecting
 * `images` and presigning one per line is wasted work for a component that
 * shows no picture, and `cartSummary` runs on every shop page's layout for a
 * signed-in client.
 */
export const PRICED_PRODUCT_SELECT_NO_IMAGES = PRICED_PRODUCT_FIELDS;

export type PricedProductRow = Prisma.ProductGetPayload<{
  select: typeof PRICED_PRODUCT_SELECT;
}>;
type MoneyProductRow = Prisma.ProductGetPayload<{
  select: typeof PRICED_PRODUCT_SELECT_NO_IMAGES;
}>;

/**
 * Prices one {product, cartons} row. Shared by `priceProductLines` (which
 * adds the thumbnail) and `priceProductLinesMoneyOnly` (which does not), so
 * the two can never price a line differently.
 *
 * An unavailable line's `unitPrice` and `amount` come back `"0.00"` rather
 * than the product's real list price — see `priceCart`'s doc comment in
 * `src/actions/shop-public.ts` for why that matters for a public caller.
 */
function priceLine(
  productId: string,
  cartons: number,
  product: MoneyProductRow,
): Omit<CartLine, "imageUrl"> {
  const unavailable =
    !product.active || product.needsReview || product.listPrice.lessThanOrEqualTo(0);
  const price = unavailable ? "0.00" : product.listPrice.toFixed(2);
  return {
    productId,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    variant: product.variant,
    packSize: product.packSize,
    unit: product.unit,
    cartons,
    unitPrice: price,
    amount: unavailable ? "0.00" : lineTotal(cartons, price),
    pieces: piecesFor(cartons, product.packSize),
    unavailable,
  };
}

/** Sorts, sums the subtotal and counts cartons — shared by both pricing paths. */
function summarizeLines(
  lines: CartLine[],
): { lines: CartLine[]; subtotal: string; cartonCount: number } {
  const sorted = [...lines].sort(
    (a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku),
  );

  // Unavailable lines are shown but never counted: the client must be able to
  // see and remove one, and must not be quoted a total that includes it.
  const subtotal = sorted
    .filter((line) => !line.unavailable)
    .reduce((sum, line) => sum.plus(new Prisma.Decimal(line.amount)), new Prisma.Decimal(0))
    .toFixed(2);

  return {
    lines: sorted,
    subtotal,
    cartonCount: sorted.reduce((sum, line) => sum + line.cartons, 0),
  };
}

/**
 * Prices a set of {product, cartons} rows at today's list price, with a
 * thumbnail. The body of `loadCart`'s old map/filter/reduce, lifted out so a
 * guest cart (Task 5, which has no `WebOrder` row to read) prices identically
 * to a client's.
 *
 * Async because the thumbnail is a signed R2 GET, not a stored URL.
 */
export async function priceProductLines(
  rows: { productId: string; cartons: number; product: PricedProductRow }[],
): Promise<{ lines: CartLine[]; subtotal: string; cartonCount: number }> {
  const priced = await Promise.all(
    rows.map(async (row) => ({
      ...priceLine(row.productId, row.cartons, row.product),
      imageUrl: await thumbUrl(row.product.images),
    })),
  );
  return summarizeLines(priced);
}

/**
 * The money-only counterpart: no `images` select, no presigned URL, for a
 * caller that never renders a thumbnail.
 */
export function priceProductLinesMoneyOnly(
  rows: { productId: string; cartons: number; product: MoneyProductRow }[],
): { lines: CartLine[]; subtotal: string; cartonCount: number } {
  const priced = rows.map((row) => ({
    ...priceLine(row.productId, row.cartons, row.product),
    imageUrl: null,
  }));
  return summarizeLines(priced);
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

/**
 * The cart, priced, without the full `CartLine` shape — what `ShopHeader` and
 * `ShopUtilityBar` (Task 7) need to show a total without loading images they
 * will not render. It selects `PRICED_PRODUCT_SELECT_NO_IMAGES` and prices
 * through `priceProductLinesMoneyOnly`, so it genuinely never selects an
 * image or signs an R2 URL — this runs on every shop page's layout for a
 * signed-in client, and a 15-line cart signing 15 thumbnails nobody displays
 * would be pure waste.
 */
export async function cartSummary(placedById: string): Promise<CartSummary> {
  const order = await prisma.webOrder.findFirst({
    where: { placedById, status: WebOrderStatus.DRAFT },
    select: {
      lines: {
        select: {
          productId: true,
          cartons: true,
          product: { select: PRICED_PRODUCT_SELECT_NO_IMAGES },
        },
      },
    },
  });
  if (!order) return EMPTY_CART_SUMMARY;

  const { lines, subtotal, cartonCount } = priceProductLinesMoneyOnly(order.lines);
  return {
    count: lines.length,
    cartonCount,
    subtotal,
    lines: lines.map((line) => ({ productId: line.productId, cartons: line.cartons })),
  };
}
