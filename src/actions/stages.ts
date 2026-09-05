"use server";

import { revalidatePath } from "next/cache";
import { PoEventKind, PoStage, Role } from "@/generated/prisma/enums";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { nextStage, prevStage, stageLabel } from "@/lib/po-stages";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Two people clicking at once must not double-advance an order. */
const RACE_LOST = "This order was already moved. Refresh.";

const guard = async () => {
  try {
    return { user: await requireUser(), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

function revalidate(poId: string) {
  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/");
}

/**
 * Moves an order one stage forward. Any member may do this.
 *
 * The update is conditional on the stage the caller last saw. That `where` is
 * the whole concurrency story: the second of two simultaneous clicks matches
 * no row, so it changes nothing and is told to refresh rather than skipping a
 * stage silently.
 */
export async function advanceStage(
  poId: string,
  note?: string,
): Promise<ActionResult<{ stage: PoStage }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { stage: true },
    });
    if (!po) return { success: false, error: "That order is gone." };

    const target = nextStage(po.stage);
    if (!target) {
      return { success: false, error: "This order is already delivered." };
    }

    const moved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id: poId, stage: po.stage },
        data: { stage: target, stageChangedAt: new Date() },
      });
      if (count === 0) return false;

      await tx.poStageEvent.create({
        data: {
          purchaseOrderId: poId,
          kind: PoEventKind.STAGE,
          fromStage: po.stage,
          toStage: target,
          note: note?.trim() || null,
          changedById: user.id,
        },
      });
      return true;
    });

    if (!moved) return { success: false, error: RACE_LOST };

    revalidate(poId);
    return { success: true, data: { stage: target } };
  } catch (cause) {
    console.error("[stages] advanceStage", cause);
    return { success: false, error: "We couldn't move that order." };
  }
}

/**
 * Moves an order one stage back. Super admins only, and the note is required —
 * this rewrites history, so the timeline has to say why and who.
 */
export async function revertStage(
  poId: string,
  note: string,
): Promise<ActionResult<{ stage: PoStage }>> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  // Checked here, not only in the UI: the button being hidden is not a
  // permission check.
  if (user.role !== Role.SUPER_ADMIN) {
    return { success: false, error: "Only a super admin can move an order back." };
  }
  if (!note.trim()) {
    return { success: false, error: "A note is required when moving back." };
  }

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { stage: true },
    });
    if (!po) return { success: false, error: "That order is gone." };

    const target = prevStage(po.stage);
    if (!target) {
      return {
        success: false,
        error: `${stageLabel(po.stage)} is the first stage.`,
      };
    }

    const moved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id: poId, stage: po.stage },
        data: { stage: target, stageChangedAt: new Date() },
      });
      if (count === 0) return false;

      await tx.poStageEvent.create({
        data: {
          purchaseOrderId: poId,
          kind: PoEventKind.STAGE,
          fromStage: po.stage,
          toStage: target,
          note: note.trim(),
          changedById: user.id,
        },
      });
      return true;
    });

    if (!moved) return { success: false, error: RACE_LOST };

    revalidate(poId);
    return { success: true, data: { stage: target } };
  } catch (cause) {
    console.error("[stages] revertStage", cause);
    return { success: false, error: "We couldn't move that order back." };
  }
}
