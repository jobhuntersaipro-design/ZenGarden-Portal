import type { PoStage } from "@/generated/prisma/enums";

/**
 * What the analytics library works on. Deliberately plain: money is a number
 * of MYR here, not a Decimal, because these are aggregates for display and
 * nothing in this folder writes to the database. Conversion happens once, in
 * `src/lib/queries/dashboard.ts`.
 */
export type AnalyticsLineItem = {
  productId: string | null;
  productName: string | null;
  /**
   * The product's own market, brand and category — the three things the
   * dashboard filters by (Phase 53 §2.2). They live on the line rather than
   * on the order because a purchase order can span all three: one document
   * can carry a Vietnam line and a Mydin line, and attributing its total to
   * either would be a lie about the other.
   *
   * All three are null where the line matched no product at all. `market` and
   * `brand` are nullable on `Product` besides; `category` is not, so a null
   * category means only "no product".
   */
  market: string | null;
  brand: string | null;
  category: string | null;
  quantity: number;
  amount: number;
};

export type AnalyticsStageEvent = {
  toStage: PoStage;
  changedAt: Date;
};

export type AnalyticsOrder = {
  id: string;
  buyerId: string;
  buyerName: string;
  poDate: Date;
  /** What the team committed to, null until somebody confirmed one. */
  deliveryDate: Date | null;
  total: number;
  stage: PoStage;
  lineItems: AnalyticsLineItem[];
  stageEvents: AnalyticsStageEvent[];
};
