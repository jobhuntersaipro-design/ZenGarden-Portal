"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { PoEventKind, PoStage, Role } from "@/generated/prisma/enums";
import { UnauthorizedError } from "@/lib/auth-guards";
import { advanceKeyFor, type PermissionKey } from "@/lib/permissions/actions";
import { requirePermission, rolesWithPermission } from "@/lib/permissions/require";
import { roleLabel } from "@/lib/permissions/roles";
import { optionalPaymentTermsSchema } from "@/lib/payment-terms";
import { prisma } from "@/lib/prisma";
import { nextStage, prevStage, stageLabel } from "@/lib/po-stages";
import { composeEditNote } from "@/lib/po-activity";
import { REASON_REQUIRED, isoDate } from "@/lib/validation/purchase-orders";
import {
  WebOrderConfirmed,
  webOrderConfirmedSubject,
} from "@/emails/WebOrderConfirmed";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { formatMYR } from "@/lib/money";
import { attachWebOrderDocument } from "@/lib/web-order-document";
import { preparePoEmail } from "@/lib/po-email";

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
  paymentTerms: optionalPaymentTermsSchema,
  // The remark is the one free-prose field on an order, so it gets a bound.
  notes: emptyToNull.pipe(
    z
      .string()
      .max(2000, "That remark is too long — 2000 characters at most")
      .nullable(),
  ),
  /**
   * Why the expected delivery date is moving. Required only when it moves —
   * see the check below, which needs the order's stored date to know that —
   * and kept on the activity row rather than on the order, so every past move
   * keeps its own reason instead of one standing remark overwriting them.
   */
  reason: emptyToNull.pipe(
    z
      .string()
      .max(2000, "That reason is too long — 2000 characters at most")
      .nullable(),
  ),
}).refine(
  // Goods cannot arrive before they were ordered — the confirm form's rule
  // too (2026-09-17). Both are YYYY-MM-DD, so they compare as calendar days;
  // a cleared date is still allowed.
  (patch) => patch.deliveryDate === null || patch.deliveryDate >= patch.poDate,
  { message: "Expected delivery can't be before the PO date.", path: ["deliveryDate"] },
);

/**
 * Phase 48: what used to be a bare `requireUser()` now asks the permission
 * grid. The shape is unchanged so every call site stays two lines.
 */
const guardPermission = async (key: PermissionKey, message?: string) => {
  try {
    return { user: await requirePermission(key, message), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};

/**
 * Who *does* advance this stage — a refusal that only says "not you" sends
 * someone to ask an admin; one that names the role sends them to the right
 * colleague.
 */
async function advanceDeniedMessage(key: PermissionKey): Promise<string> {
  const owners = (await rolesWithPermission(key)).filter(
    (role) => role !== Role.SUPER_ADMIN,
  );
  if (owners.length === 0) return "Only a super admin advances this stage.";
  return `${owners.map(roleLabel).join(" or ")} advances this stage.`;
}

function revalidate(poId: string) {
  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/");
}

/**
 * Moves an order one stage forward. Only a role that owns this stage may.
 *
 * The permission key is derived from the stage the database holds, never from
 * anything the caller sent, so a planner forging a request against a
 * QC-passed order is refused by the same fact that hides their button.
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
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      select: { stage: true },
    });
    if (!po) return { success: false, error: "That order is gone." };

    const target = nextStage(po.stage);
    const key = advanceKeyFor(po.stage);
    if (!target || !key) {
      return { success: false, error: "This order is already delivered." };
    }

    const { user, error } = await guardPermission(
      key,
      await advanceDeniedMessage(key),
    );
    if (!user) return { success: false, error: error! };

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
  // Checked here, not only in the UI: the button being hidden is not a
  // permission check. Phase 48 moved this off an inline role comparison —
  // the codebase's last one — and onto the grid.
  const { user, error } = await guardPermission("po.revert");
  if (!user) return { success: false, error: error! };
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
  /** Why the expected delivery date is moving; required when it is. */
  reason: string | null;
};

const FIELD_LABELS: Record<
  Exclude<keyof PurchaseOrderPatch, "reason">,
  string
> = {
  poDate: "PO date",
  deliveryDate: "expected delivery",
  paymentTerms: "payment terms",
  notes: "remark",
};

/**
 * A moved delivery date is recorded with both dates, not just the field's
 * name: "it changed" cannot answer what it changed from, and that is the
 * question anyone reads this row to settle.
 */
function describeDeliveryMove(
  before: Date | null,
  after: string | null,
): string {
  const to = after ? formatDate(new Date(after)) : null;
  const from = before ? formatDate(before) : null;
  if (from && to) return `Expected delivery ${from} → ${to}`;
  if (to) return `Expected delivery set to ${to}`;
  return `Expected delivery cleared (was ${from})`;
}

/**
 * Edits the header fields of a confirmed PO. Every edit appends an activity
 * entry naming what changed, so the record says how it got to its current
 * shape — an EDIT event, which every analytics function ignores.
 */
export async function updatePurchaseOrder(
  poId: string,
  patch: PurchaseOrderPatch,
): Promise<ActionResult> {
  const { user, error } = await guardPermission("po.edit");
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
            // Names the order in the subject and heading (2026-09-20).
            buyerReference: true,
            placedBy: { select: { email: true } },
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
    if ((po.paymentTerms ?? null) !== data.paymentTerms) {
      changed.push(FIELD_LABELS.paymentTerms);
    }
    if ((po.notes ?? null) !== data.notes) changed.push(FIELD_LABELS.notes);

    // Nothing moved: no write, and no activity entry claiming one.
    if (!deliveryMoved && changed.length === 0) {
      return { success: true, data: undefined };
    }

    // The date the buyer is waiting on does not move unattributed. Checked
    // here as well as in the sheet, because the sheet is not the only thing
    // that can call this.
    if (deliveryMoved && !data.reason) {
      return { success: false, error: REASON_REQUIRED };
    }

    /**
     * The delivery move leads the record and names both dates; anything else
     * that changed follows it by name, as it always did.
     */
    const detail = [
      deliveryMoved ? describeDeliveryMove(po.deliveryDate, data.deliveryDate) : null,
      changed.length > 0 ? `Edited: ${changed.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

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
          note: composeEditNote({
            detail,
            reason: deliveryMoved ? data.reason : null,
          }),
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
        const mail = await preparePoEmail(order.id, order.reference, redrawn);
        await sendEmail({
          to: [order.placedBy.email],
          subject: webOrderConfirmedSubject(
            order.buyerReference,
            order.reference,
            when,
            true,
          ),
          attachments: mail.attachments,
          react: WebOrderConfirmed({
            reference: order.reference,
            poNumber: order.buyerReference,
            expectedDelivery: when,
            total: formatMYR(po.total.toNumber()),
            orderUrl: `${env.SHOP_URL ?? env.APP_URL}/orders/${poId}`,
            updated: true,
            attached: mail.attached,
            document: mail.document,
            preview: mail.preview,
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
