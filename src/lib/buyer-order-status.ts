import { stageLabel } from "@/lib/po-stages";
import type { PoStage } from "@/generated/prisma/enums";

/**
 * What a buyer reads where the ops team reads a status and a stage.
 *
 * A plain module, deliberately not part of `BuyerOrdersTable`: that file is
 * `"use client"`, and a Server Component may not call a function exported from
 * one — the defect Phase 31 hit with `singleGroup`. The orders page is a
 * server component and builds its rows with this.
 */
export function buyerOrderStatus(order: {
  kind: "confirmed" | "submitted" | "declined";
  stage: PoStage | null;
}): string {
  if (order.kind === "declined") return "Not accepted";
  if (order.kind === "confirmed" && order.stage) return stageLabel(order.stage);
  // Phase 38: there is now a concrete thing being waited for — the team
  // confirming a delivery date, which arrives by email the moment they do.
  // "With the team" said where the order was; this says what happens next.
  return "Awaiting confirmation";
}
