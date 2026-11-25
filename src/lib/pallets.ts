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

type Truck = { pallets: number | null; status: "PENDING" | "DELIVERING" | "DELIVERED" };

/**
 * Where a land shipment's pallets stand, summed over its trucks (2026-11-25):
 * a Delivering truck's count is on the way, a Delivered one's has arrived, a
 * Pending one has not left. What is left of the orders' total is still to
 * deliver. Delivered is capped at the total first, then on the way, so the
 * three never add up to more than the orders hold; `over` is how many pallets the trucks
 * were typed with beyond that.
 */
export function palletSplit(total: number, trucks: Truck[]) {
  const sum = (status: Truck["status"]) =>
    trucks.filter((t) => t.status === status).reduce((n, t) => n + Math.max(t.pallets ?? 0, 0), 0);
  const delivered = Math.min(sum("DELIVERED"), total);
  const onTruck = Math.min(sum("DELIVERING"), total - delivered);
  const typed = trucks.reduce((n, t) => n + Math.max(t.pallets ?? 0, 0), 0);
  return { delivered, onTruck, remaining: total - delivered - onTruck, over: total > 0 ? Math.max(typed - total, 0) : 0 };
}

/** One status for the whole shipment: delivered once every truck is, on the way once any truck has left. */
export function landStatusOf(trucks: { status: Truck["status"] }[]): Truck["status"] {
  if (trucks.length && trucks.every((t) => t.status === "DELIVERED")) return "DELIVERED";
  return trucks.some((t) => t.status !== "PENDING") ? "DELIVERING" : "PENDING";
}
