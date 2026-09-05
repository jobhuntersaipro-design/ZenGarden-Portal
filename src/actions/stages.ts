"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { PoEventKind, PoStage, Role } from "@/generated/prisma/enums";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { nextStage, prevStage, stageLabel } from "@/lib/po-stages";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Two people clicking at once must not double-advance an order. */
const RACE_LOST = "This order was already moved. Refresh.";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, YYYY-MM-DD");

const emptyToNull = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null);

const purchaseOrderPatchSchema = z.object({
  poNumber: z.string().min(1, "PO number is required"),
  poDate: isoDate,
  deliveryDate: isoDate.nullable(),
  buyerReference: emptyToNull,
  paymentTerms: emptyToNull,
  notes: emptyToNull,
});

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

/** Fields the edit sheet may change. Line items are handled alongside. */
export type PurchaseOrderPatch = {
  poNumber: string;
  poDate: string;
  deliveryDate: string | null;
  buyerReference: string | null;
  paymentTerms: string | null;
  notes: string | null;
};

const FIELD_LABELS: Record<keyof PurchaseOrderPatch, string> = {
  poNumber: "PO number",
  poDate: "PO date",
  deliveryDate: "delivery date",
  buyerReference: "buyer reference",
  paymentTerms: "payment terms",
  notes: "notes",
};

/**
 * Edits the header fields of a confirmed PO. Every edit appends an activity
 * entry naming what changed, so the record says how it got to its current
 * shape — an EDIT event, which every analytics function ignores.
 */
export async function updatePurchaseOrder(
  poId: string,
  patch: PurchaseOrderPatch,
): Promise<ActionResult> {
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };

  const parsed = purchaseOrderPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Those changes could not be saved.",
    };
  }
  const data = parsed.data;

  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: {
        stage: true,
        poNumber: true,
        poDate: true,
        deliveryDate: true,
        buyerReference: true,
        paymentTerms: true,
        notes: true,
      },
    });
    if (!po) return { success: false, error: "That order is gone." };

    const asDay = (value: Date | null) =>
      value ? value.toISOString().slice(0, 10) : null;

    const changed: string[] = [];
    if (po.poNumber !== data.poNumber) changed.push(FIELD_LABELS.poNumber);
    if (asDay(po.poDate) !== data.poDate) changed.push(FIELD_LABELS.poDate);
    if (asDay(po.deliveryDate) !== data.deliveryDate) {
      changed.push(FIELD_LABELS.deliveryDate);
    }
    if ((po.buyerReference ?? null) !== data.buyerReference) {
      changed.push(FIELD_LABELS.buyerReference);
    }
    if ((po.paymentTerms ?? null) !== data.paymentTerms) {
      changed.push(FIELD_LABELS.paymentTerms);
    }
    if ((po.notes ?? null) !== data.notes) changed.push(FIELD_LABELS.notes);

    // Nothing moved: no write, and no activity entry claiming one.
    if (changed.length === 0) return { success: true, data: undefined };

    await prisma.$transaction([
      prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          poNumber: data.poNumber,
          poDate: new Date(data.poDate),
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
          buyerReference: data.buyerReference,
          paymentTerms: data.paymentTerms,
          notes: data.notes,
        },
      }),
      prisma.poStageEvent.create({
        data: {
          purchaseOrderId: poId,
          kind: PoEventKind.EDIT,
          fromStage: po.stage,
          toStage: po.stage,
          changedById: user.id,
          note: `Edited: ${changed.join(", ")}`,
        },
      }),
    ]);

    revalidate(poId);
    return { success: true, data: undefined };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return {
        success: false,
        error: "This buyer already has a PO with that number.",
      };
    }
    console.error("[stages] updatePurchaseOrder", cause);
    return { success: false, error: "We couldn't save those changes." };
  }
}
