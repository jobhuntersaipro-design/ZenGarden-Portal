/**
 * An order's pallets, each line rounded up as the PO document rounds it. A
 * line whose product has no cartons-per-pallet is not guessed: it is counted
 * apart so the screen can say the total is short.
 */
export function palletsOf(lines: { quantity: { toString(): string } | number; product: { cartonsPerPallet: number | null } | null }[]) {
  let pallets = 0;
  let unpalletedLines = 0;
  for (const line of lines) {
    const per = line.product?.cartonsPerPallet ?? null;
    if (per === null || per <= 0) unpalletedLines += 1;
    else pallets += Math.ceil(Number(line.quantity) / per);
  }
  return { pallets, unpalletedLines };
}

/**
 * Where a land shipment's pallets stand: the truck's typed count is "on the
 * truck" until the delivered date is set, then "delivered". What is left of
 * the orders' total is still to deliver. A truck count above the total is
 * capped, so the three never add up to more than the orders hold.
 */
export function palletSplit(total: number, onTruck: number | null, delivered: boolean) {
  const truck = Math.min(Math.max(onTruck ?? 0, 0), total);
  return {
    delivered: delivered ? truck : 0,
    onTruck: delivered ? 0 : truck,
    remaining: total - truck,
  };
}
