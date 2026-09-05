import { PoStage } from "../../src/generated/prisma/enums";
import type { Rng } from "./rng";
import { PRODUCTS, driftedPrice } from "./products";

export type PlannedLine = {
  position: number;
  productIndex: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type PlannedOrder = {
  buyerIndex: number;
  poDate: Date;
  deliveryDate: Date;
  lines: PlannedLine[];
  subtotal: number;
  total: number;
  stage: PoStage;
  stageChangedAt: Date;
  uploadedByAisha: boolean;
  confidence: number;
  pageCount: number;
  sizeBytes: number;
};

/** Stage order, mirroring src/lib/po-stages.ts without importing app code. */
export const PO_STAGES_ORDER = [
  PoStage.ORDER_PLACED,
  PoStage.IN_PRODUCTION,
  PoStage.QC_PASSED,
  PoStage.IN_WAREHOUSE,
  PoStage.DELIVERING,
  PoStage.DELIVERED,
] as const;

const MIN_TOTAL = 1_000;
const MAX_TOTAL = 150_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every PO date in the window: 0–3 per weekday, ~15% of Saturdays, no Sundays. */
export function planDates(rng: Rng, from: Date, to: Date): Date[] {
  const dates: Date[] = [];
  const day = utcDay(from);
  const last = utcDay(to);
  for (; day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday === 0) continue; // never a Sunday
    const count = weekday === 6 ? (rng.chance(0.15) ? 1 : 0) : rng.int(0, 3);
    for (let i = 0; i < count; i++) dates.push(new Date(day));
  }
  return dates;
}

/**
 * Midnight UTC on the same calendar day. @db.Date truncates in UTC, so a date
 * built at local midnight lands on the previous day and shifts the weekday.
 */
export function utcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** Age in days → stage, with ±3 days of noise so boundaries are not crisp. */
export function stageForAge(rng: Rng, ageDays: number): PoStage {
  const noisy = ageDays + rng.float(-3, 3);
  if (noisy < 3) return PoStage.ORDER_PLACED;
  if (noisy < 8) return PoStage.IN_PRODUCTION;
  if (noisy < 12) return PoStage.QC_PASSED;
  if (noisy < 16) return PoStage.IN_WAREHOUSE;
  if (noisy < 20) return PoStage.DELIVERING;
  return PoStage.DELIVERED;
}

export function planOrder(
  rng: Rng,
  poDate: Date,
  buyerIndex: number,
  valueScale: number,
  now: Date,
): PlannedOrder {
  // Log-uniform target so most orders are small and a few are large.
  const target = Math.min(
    MAX_TOTAL,
    Math.max(
      MIN_TOTAL,
      Math.exp(rng.float(Math.log(MIN_TOTAL * 1.4), Math.log(MAX_TOTAL * 0.55))) *
        valueScale,
    ),
  );

  const lineCount = rng.int(2, 6);
  const weights = Array.from({ length: lineCount }, () => rng.float(0.5, 1.5));
  const weightTotal = weights.reduce((a, b) => a + b, 0);

  const chosen = new Set<number>();
  const lines: PlannedLine[] = [];

  for (let i = 0; i < lineCount; i++) {
    let productIndex = rng.int(0, PRODUCTS.length - 1);
    let guard = 0;
    while (chosen.has(productIndex) && guard++ < 12) {
      productIndex = rng.int(0, PRODUCTS.length - 1);
    }
    chosen.add(productIndex);

    const product = PRODUCTS[productIndex];
    const unitPrice = round4(
      driftedPrice(product.base, product.drift, poDate) * rng.float(0.98, 1.02),
    );
    const share = (target * weights[i]) / weightTotal;
    const quantity = Math.max(1, Math.round(share / unitPrice));

    lines.push({
      position: i + 1,
      productIndex,
      description: product.name,
      unit: product.unit,
      quantity,
      unitPrice,
      amount: round2(quantity * unitPrice),
    });
  }

  let subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));

  // Quantities are whole units, so rounding can overshoot the ceiling. Trim the
  // largest line until the order is back inside the range.
  while (subtotal > MAX_TOTAL) {
    const largest = lines.reduce((a, b) => (a.amount >= b.amount ? a : b));
    if (largest.quantity <= 1) break;
    largest.quantity -= Math.max(1, Math.round(largest.quantity * 0.1));
    largest.quantity = Math.max(1, largest.quantity);
    largest.amount = round2(largest.quantity * largest.unitPrice);
    subtotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  }
  const ageDays = Math.floor((now.getTime() - poDate.getTime()) / 86_400_000);
  const stage = stageForAge(rng, ageDays);

  const deliveryDate = utcDay(poDate);
  deliveryDate.setUTCDate(deliveryDate.getUTCDate() + rng.int(12, 22));

  return {
    buyerIndex,
    poDate,
    deliveryDate,
    lines,
    subtotal,
    total: subtotal, // tax 0 — SST does not apply to these goods
    stage,
    stageChangedAt: poDate,
    uploadedByAisha: rng.chance(0.4),
    confidence: rng.int(82, 99),
    pageCount: rng.int(1, 3),
    sizeBytes: rng.int(200_000, 2_000_000),
  };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
