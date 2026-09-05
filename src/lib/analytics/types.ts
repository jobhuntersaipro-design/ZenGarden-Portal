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
  quantity: number;
  amount: number;
};

export type AnalyticsStageEvent = {
  toStage: PoStage;
  changedAt: Date;
};

export type AnalyticsOrder = {
  id: string;
  poNumber: string;
  buyerId: string;
  buyerName: string;
  poDate: Date;
  total: number;
  stage: PoStage;
  lineItems: AnalyticsLineItem[];
  stageEvents: AnalyticsStageEvent[];
};
