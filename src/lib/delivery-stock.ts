/**
 * What leaves the shelf when an order goes out for delivery.
 *
 * Pure: no Prisma. The stage action plans with this, then writes inside the
 * same transaction as the stage change. Delivering is the stage the team
 * calls out for delivery; the stored reason is the words they use.
 */

export const OUT_FOR_DELIVERY_REASON = "Out for Delivery";

export type DeliveryLine = {
  id: string;
  position: number;
  description: string;
  /** Decimal cartons, as stored on `LineItem.quantity`. */
  quantity: string;
  productId: string | null;
  productName: string | null;
  variant: string | null;
};

export type StockOnHand = {
  id: string;
  name: string;
  variant: string | null;
  stockCartons: number | null;
};

export type PlannedMovement = {
  lineItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  beforeCartons: number;
  afterCartons: number;
};

export type PlannedProduct = {
  productId: string;
  /** The on-hand figure the compare-and-set must still see. */
  beforeCartons: number;
  afterCartons: number;
};

export type DeliveryPlan =
  | { ok: true; movements: PlannedMovement[]; products: PlannedProduct[] }
  | { ok: false; error: string };

/**
 * A variant is its own product, and the catalogue already prints the variant
 * in the name (`ZEN 2.1L — Goat's Milk`). Append it only when the name does
 * not already carry it, so the error does not say it twice.
 */
export function deliveryProductName(name: string, variant: string | null): string {
  if (!variant) return name;
  if (name.toLowerCase().includes(variant.toLowerCase())) return name;
  return `${name} — ${variant}`;
}

/**
 * Line quantity is a decimal; stock is whole cartons. `3`, `3.0` and `3.000`
 * are 3. Anything with a non-zero fraction cannot be deducted.
 */
export function wholeCartons(
  quantity: string,
): { ok: true; cartons: number } | { ok: false } {
  const text = quantity.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false };
  const [whole, frac = ""] = text.split(".");
  if (/[^0]/.test(frac)) return { ok: false };
  const cartons = Number(whole);
  if (!Number.isSafeInteger(cartons)) return { ok: false };
  return { ok: true, cartons };
}

type Problem = {
  position: number;
  text: string;
};

/**
 * The sentence a person sees when the move is refused. Every short product,
 * uncounted product, unlinked line and fractional quantity is named; nothing
 * has been written when this returns.
 */
export function deliveryStockError(problems: string[]): string {
  return `Not enough stock to mark this order out for delivery. ${problems.join(". ")}.`;
}

/**
 * Sum each product's lines, then refuse the whole order if any line cannot
 * be taken. A second line of the same product counts against what the first
 * line already needs, so 6 and 6 against 10 is short even though each line
 * alone would pass.
 */
export function planDeliveryDeduction(
  lines: DeliveryLine[],
  stock: StockOnHand[],
): DeliveryPlan {
  const onHand = new Map(stock.map((row) => [row.id, row]));
  const ordered = [...lines].sort((a, b) => a.position - b.position);
  const problems: Problem[] = [];
  const wanted = new Map<
    string,
    { name: string; needed: number; lines: { id: string; cartons: number }[] }
  >();

  for (const line of ordered) {
    const parsed = wholeCartons(line.quantity);
    if (!parsed.ok) {
      const label = line.productName
        ? deliveryProductName(line.productName, line.variant)
        : `"${line.description}"`;
      problems.push({
        position: line.position,
        text: `${label} is ordered as ${line.quantity.trim()} cartons, and stock is whole cartons`,
      });
      continue;
    }
    if (parsed.cartons === 0) continue;

    if (!line.productId || !onHand.has(line.productId)) {
      problems.push({
        position: line.position,
        text: `"${line.description}" isn't linked to a product`,
      });
      continue;
    }

    const product = onHand.get(line.productId)!;
    const name = deliveryProductName(product.name, product.variant);
    const group = wanted.get(line.productId) ?? { name, needed: 0, lines: [] };
    group.needed += parsed.cartons;
    group.lines.push({ id: line.id, cartons: parsed.cartons });
    wanted.set(line.productId, group);
  }

  for (const [productId, group] of wanted) {
    const available = onHand.get(productId)?.stockCartons ?? null;
    if (available === null) {
      problems.push({
        position: group.lines[0] ? ordered.find((line) => line.id === group.lines[0].id)?.position ?? 0 : 0,
        text: `${group.name} needs ${group.needed} cartons, none counted`,
      });
      continue;
    }
    if (group.needed > available) {
      problems.push({
        position: ordered.find((line) => line.productId === productId)?.position ?? 0,
        text: `${group.name} needs ${group.needed} cartons, ${available} available`,
      });
    }
  }

  if (problems.length > 0) {
    problems.sort((a, b) => a.position - b.position);
    return { ok: false, error: deliveryStockError(problems.map((problem) => problem.text)) };
  }

  const running = new Map<string, number>();
  const movements: PlannedMovement[] = [];
  for (const line of ordered) {
    const parsed = wholeCartons(line.quantity);
    if (!parsed.ok || parsed.cartons === 0 || !line.productId) continue;
    const product = onHand.get(line.productId)!;
    const before = running.get(line.productId) ?? product.stockCartons!;
    const after = before - parsed.cartons;
    running.set(line.productId, after);
    movements.push({
      lineItemId: line.id,
      productId: line.productId,
      productName: deliveryProductName(product.name, product.variant),
      quantity: parsed.cartons,
      beforeCartons: before,
      afterCartons: after,
    });
  }

  const products: PlannedProduct[] = [...running.entries()].map(([productId, afterCartons]) => ({
    productId,
    beforeCartons: onHand.get(productId)!.stockCartons!,
    afterCartons,
  }));

  return { ok: true, movements, products };
}

/** Latest stocktake minus cartons sent out after that count was typed. */
export function onHandAfterDeliveries(cartons: number, deliveredSince: number): number {
  return cartons - deliveredSince;
}

/** How the stock history reads one deduction. */
export function describeStockMovement(entry: {
  quantity: number;
  beforeCartons: number;
  afterCartons: number;
  poNumber: string | null;
  reason: string;
}): string {
  const order = entry.poNumber ?? "the order";
  const qty = entry.quantity.toLocaleString("en-MY");
  const before = entry.beforeCartons.toLocaleString("en-MY");
  const after = entry.afterCartons.toLocaleString("en-MY");
  return `${qty} cartons out for delivery, ${before} → ${after}, ${order}. ${entry.reason}`;
}
