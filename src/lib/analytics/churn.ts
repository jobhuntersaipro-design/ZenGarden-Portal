import type { AnalyticsOrder } from "@/lib/analytics/types";

export type ChurnClass = "lapsed" | "at-risk";

export type ChurnRow = {
  buyerId: string;
  buyerName: string;
  klass: ChurnClass;
  lastOrderAt: Date;
  daysSilent: number;
  /** What they spent in the previous period — the value at stake. */
  previousValue: number;
};

export type BuyerChurn = {
  rows: ChurnRow[];
  lapsedCount: number;
  atRiskCount: number;
  activeLastPeriod: number;
  /** Lapsed ÷ buyers active in the previous period, 0-100. */
  churnRate: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Below this nobody is "at risk", however tight their cadence. */
const AT_RISK_FLOOR_DAYS = 14;
/** Silent for this long and past 3× cadence is Churned, not At risk. */
const CHURNED_DAYS = 90;
const MAX_ROWS = 6;

/**
 * Mean gap in days between a buyer's orders across their whole history. One
 * order gives no cadence at all — which is why a first-time buyer can never be
 * "at risk" on this measure.
 */
function cadenceDays(dates: Date[]): number | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let sum = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    sum += (sorted[index].getTime() - sorted[index - 1].getTime()) / DAY_MS;
  }
  return sum / (sorted.length - 1);
}

/**
 * Lapsed and At risk over the page's range against its previous period.
 *
 * At risk is cadence-aware on purpose: a weekly buyer trips after about two
 * weeks and a quarterly one does not trip at all. A fixed threshold would
 * flag every buyer who simply orders rarely.
 *
 * Churned — silent 90+ days *and* past 3× cadence — is excluded, so dead
 * accounts do not crowd out the buyers still worth a phone call.
 */
export function buyerChurn(
  current: AnalyticsOrder[],
  previous: AnalyticsOrder[],
  allHistory: AnalyticsOrder[],
  now: Date = new Date(),
): BuyerChurn {
  const historyByBuyer = new Map<string, { name: string; dates: Date[] }>();
  for (const order of allHistory) {
    const entry = historyByBuyer.get(order.buyerId) ?? {
      name: order.buyerName,
      dates: [],
    };
    entry.dates.push(order.poDate);
    historyByBuyer.set(order.buyerId, entry);
  }

  const currentBuyers = new Set(current.map((order) => order.buyerId));

  const previousValueByBuyer = new Map<string, number>();
  for (const order of previous) {
    previousValueByBuyer.set(
      order.buyerId,
      (previousValueByBuyer.get(order.buyerId) ?? 0) + order.total,
    );
  }

  const rows: ChurnRow[] = [];

  for (const [buyerId, history] of historyByBuyer) {
    const lastOrderAt = history.dates.reduce((latest, date) =>
      date.getTime() > latest.getTime() ? date : latest,
    );
    const daysSilent = Math.floor(
      (now.getTime() - lastOrderAt.getTime()) / DAY_MS,
    );
    const cadence = cadenceDays(history.dates);

    const orderedPreviously = previousValueByBuyer.has(buyerId);
    const orderedNow = currentBuyers.has(buyerId);

    if (orderedPreviously && !orderedNow) {
      rows.push({
        buyerId,
        buyerName: history.name,
        klass: "lapsed",
        lastOrderAt,
        daysSilent,
        previousValue: previousValueByBuyer.get(buyerId) ?? 0,
      });
      continue;
    }

    if (!orderedNow) continue;
    if (cadence === null) continue;

    const isChurned = daysSilent >= CHURNED_DAYS && daysSilent > cadence * 3;
    const isAtRisk =
      !isChurned && daysSilent > cadence * 2 && daysSilent >= AT_RISK_FLOOR_DAYS;

    if (isAtRisk) {
      rows.push({
        buyerId,
        buyerName: history.name,
        klass: "at-risk",
        lastOrderAt,
        daysSilent,
        previousValue: previousValueByBuyer.get(buyerId) ?? 0,
      });
    }
  }

  // Lapsed first — a buyer who has stopped is more urgent than one slowing
  // down — then by what is at stake.
  rows.sort((a, b) => {
    if (a.klass !== b.klass) return a.klass === "lapsed" ? -1 : 1;
    return b.previousValue - a.previousValue;
  });

  const lapsedCount = rows.filter((row) => row.klass === "lapsed").length;
  const activeLastPeriod = previousValueByBuyer.size;

  return {
    rows: rows.slice(0, MAX_ROWS),
    lapsedCount,
    atRiskCount: rows.filter((row) => row.klass === "at-risk").length,
    activeLastPeriod,
    churnRate: activeLastPeriod > 0 ? (lapsedCount / activeLastPeriod) * 100 : 0,
  };
}
