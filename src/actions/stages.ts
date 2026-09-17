"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { PoEventKind, PoStage, Role } from "@/generated/prisma/enums";
import { UnauthorizedError, requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { nextStage, prevStage, stageLabel } from "@/lib/po-stages";
import { isoDate } from "@/lib/validation/purchase-orders";
import {
  WebOrderConfirmed,
  webOrderConfirmedSubject,
} from "@/emails/WebOrderConfirmed";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { attachWebOrderDocument } from "@/lib/web-order-document";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Two people clicking at once must not double-advance an order. */
const RACE_LOST = "This order was already moved. Refresh.";

const emptyToNull = z
  .string()
  .nullable()
  .transform((value) => value?.trim() || null);

const purchaseOrderPatchSchema = z.object({
  // No PO number (2026-09-17): it is the buyer's own, set at review, and the
  // edit sheet shows it read-only. A patch carrying one is stripped here.
  poDate: isoDate,
  /** The day the team committed to. Nullable: a scanned PO may carry none. */
  deliveryDate: isoDate.nullable(),
  paymentTerms: emptyToNull,
  // The remark is the one free-prose field on an order, so it gets a bound.
  notes: emptyToNull.pipe(
    z
      .string()
      .max(2000, "That remark is too long — 2000 characters at most")
      .nullable(),
  ),
}).refine(
  // Goods cannot arrive before they were ordered — the confirm form's rule
  // too (2026-09-17). Both are YYYY-MM-DD, so they compare as calendar days;
  // a cleared date is still allowed.
  (patch) => patch.deliveryDate === null || patch.deliveryDate >= patch.poDate,
  { message: "Expected delivery can't be before the PO date.", path: ["deliveryDate"] },
);

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
  poDate: string;
  deliveryDate: string | null;
  paymentTerms: string | null;
  notes: string | null;
};

const FIELD_LABELS: Record<keyof PurchaseOrderPatch, string> = {
  poDate: "PO date",
  deliveryDate: "expected delivery",
  paymentTerms: "payment terms",
  notes: "remark",
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
        poDate: true,
        deliveryDate: true,
        paymentTerms: true,
        notes: true,
        total: true,
        currency: true,
        // Only a shop order has a buyer waiting on this date, and only they
        // are told when it moves.
        webOrder: {
          select: {
            id: true,
            reference: true,
            buyerReference: true,
            placedBy: { select: { email: true } },
            _count: { select: { lines: true } },
          },
        },
      },
    });
    if (!po) return { success: false, error: "That order is gone." };

    const asDay = (value: Date | null) =>
      value ? value.toISOString().slice(0, 10) : null;

    const changed: string[] = [];
    if (asDay(po.poDate) !== data.poDate) changed.push(FIELD_LABELS.poDate);
    const deliveryMoved = asDay(po.deliveryDate) !== data.deliveryDate;
    if (deliveryMoved) changed.push(FIELD_LABELS.deliveryDate);
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
          poDate: new Date(data.poDate),
          // An ISO day parses as UTC midnight, which is what a `@db.Date`
          // column stores — the same rule `submitWebOrder` follows.
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
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

    // A delivery date that moves without telling the buyer is exactly what
    // they would ring up about. Only for an order they placed themselves —
    // a scanned PO has no shop account behind it to write to — and after the
    // response, through sendEmail, which never throws.
    //
    // The purchase-order file prints that date too (Phase 42), so it is
    // redrawn whenever the date moves — cleared included — and the redrawn
    // file rides on the email.
    if (deliveryMoved && po.webOrder) {
      const order = po.webOrder;
      const newDate = data.deliveryDate;
      after(async () => {
        const redrawn = await attachWebOrderDocument(order.id, { redraw: true });
        if (!newDate) return;
        // Formatted once and used for both, or the subject line and the body
        // print the same day two different ways.
        const when = formatDate(newDate);
        await sendEmail({
          to: [order.placedBy.email],
          subject: webOrderConfirmedSubject(order.reference, when, true),
          attachments: redrawn
            ? [{ filename: redrawn.filename, content: Buffer.from(redrawn.bytes) }]
            : undefined,
          react: WebOrderConfirmed({
            reference: order.reference,
            buyerReference: order.buyerReference,
            expectedDelivery: when,
            lineCount: order._count.lines,
            total: formatMYR(po.total.toNumber()),
            orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${poId}`,
            updated: true,
            attached: Boolean(redrawn),
          }),
        });
      });
    }

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
