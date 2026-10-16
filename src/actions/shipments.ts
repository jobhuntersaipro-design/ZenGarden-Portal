"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { ShipmentDocType } from "@/generated/prisma/enums";
import type { ActionResult } from "@/actions/purchase-orders";
import { UnauthorizedError, type SessionUser } from "@/lib/auth-guards";
import type { PermissionKey } from "@/lib/permissions/actions";
import { requirePermission } from "@/lib/permissions/require";
import { prisma } from "@/lib/prisma";
import { deleteObject } from "@/lib/r2";
import { SLOT_LABEL, shipmentReference } from "@/lib/shipments/checklist";
import { orderIdentity, orderLabel, ORDER_IDENTITY_SELECT } from "@/lib/order-identity";

const LIST = "/shipments";

async function guard(...keys: PermissionKey[]): Promise<{ user: SessionUser; error: null } | { user: null; error: string }> {
  let last = "You are not signed in.";
  for (const key of keys) {
    try {
      return { user: await requirePermission(key), error: null };
    } catch (cause) {
      if (!(cause instanceof UnauthorizedError)) throw cause;
      last = cause.message;
    }
  }
  return { user: null, error: last };
}

const id = z.string().min(1).max(64);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

/** One line on the shipment's own activity, in the same transaction as the change. */
const log = (
  tx: Prisma.TransactionClient,
  shipmentId: string,
  user: SessionUser,
  action: string,
  text: string,
) => tx.shipmentEvent.create({ data: { shipmentId, actorId: user.id, actorName: user.name, action, text } });

const touch = (shipmentId: string, orderIds: (string | null | undefined)[] = []) => {
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${shipmentId}`);
  for (const poId of orderIds) if (poId) revalidatePath(`/purchase-orders/${poId}`);
};

/** Only orders of the shipment's own buyer, still live. Returns the labels for the activity line. */
async function sameBuyerOrders(
  tx: Prisma.TransactionClient,
  buyerId: string,
  ids: string[],
): Promise<string[] | null> {
  const orders = await tx.purchaseOrder.findMany({
    where: { id: { in: ids }, buyerId, supersededBy: null },
    select: { id: true, ...ORDER_IDENTITY_SELECT },
  });
  if (orders.length !== new Set(ids).size) return null;
  return orders.map((po) => orderLabel(orderIdentity(po)));
}

const SAME_BUYER = "Every order on a shipment must be the same buyer's.";

const createSchema = z.object({
  buyerId: id,
  purchaseOrderIds: z.array(id).min(1, "Choose at least one order.").max(100),
  market: text(80),
  formDRequired: z.boolean(),
  note: text(2000),
  bookingId: id.nullable().optional(),
});

export async function createShipment(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const data = parsed.data;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const labels = await sameBuyerOrders(tx, data.buyerId, data.purchaseOrderIds);
      if (!labels) return null;
      const row = await tx.shipment.create({
        data: {
          reference: `pending-${crypto.randomUUID()}`,
          buyerId: data.buyerId,
          market: data.market ?? null,
          formDRequired: data.formDRequired,
          note: data.note ?? null,
          createdById: user.id,
          orders: { create: data.purchaseOrderIds.map((purchaseOrderId) => ({ purchaseOrderId })) },
        },
        select: { id: true, seq: true, createdAt: true },
      });
      const reference = shipmentReference(row.seq, row.createdAt);
      await tx.shipment.update({ where: { id: row.id }, data: { reference } });
      await log(tx, row.id, user, "SHIPMENT_CREATED", `created ${reference} with ${labels.join(", ")}`);
      if (data.bookingId) {
        const linked = await tx.bookingConfirmation.updateMany({
          where: { id: data.bookingId },
          data: { shipmentId: row.id },
        });
        if (linked.count) await log(tx, row.id, user, "SHIPMENT_BOOKING_LINKED", "linked the booking confirmation");
      }
      return row.id;
    });
    if (!created) return { success: false, error: SAME_BUYER };
    touch(created, data.purchaseOrderIds);
    if (data.bookingId) revalidatePath(`/booking-confirmations/${data.bookingId}`);
    return { success: true, data: { id: created } };
  } catch (cause) {
    console.error("[shipments] create", cause);
    return { success: false, error: "We couldn't create that shipment." };
  }
}

const updateSchema = z.object({
  id,
  market: text(80),
  formDRequired: z.boolean(),
  note: text(2000),
});

export async function updateShipment(input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { id: shipmentId, ...data } = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.shipment.findUniqueOrThrow({
        where: { id: shipmentId },
        select: { market: true, formDRequired: true, note: true },
      });
      await tx.shipment.update({
        where: { id: shipmentId },
        data: { market: data.market ?? null, formDRequired: data.formDRequired, note: data.note ?? null },
      });
      const changed = [
        before.market !== (data.market ?? null) && "market",
        before.formDRequired !== data.formDRequired && (data.formDRequired ? "Form D needed" : "Form D not needed"),
        before.note !== (data.note ?? null) && "note",
      ].filter(Boolean);
      if (changed.length) await log(tx, shipmentId, user, "SHIPMENT_UPDATED", `edited ${changed.join(", ")}`);
    });
    touch(shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] update", cause);
    return { success: false, error: "We couldn't save that shipment." };
  }
}

export async function addOrdersToShipment(input: { shipmentId: string; purchaseOrderIds: string[] }): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = z.object({ shipmentId: id, purchaseOrderIds: z.array(id).min(1).max(100) }).safeParse(input);
  if (!parsed.success) return { success: false, error: "Choose at least one order." };
  const { shipmentId, purchaseOrderIds } = parsed.data;
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({ where: { id: shipmentId }, select: { buyerId: true } });
      if (!shipment) return false;
      const labels = await sameBuyerOrders(tx, shipment.buyerId, purchaseOrderIds);
      if (!labels) return false;
      await tx.shipmentOrder.createMany({
        data: purchaseOrderIds.map((purchaseOrderId) => ({ shipmentId, purchaseOrderId })),
        skipDuplicates: true,
      });
      await log(tx, shipmentId, user, "SHIPMENT_ORDER_ADDED", `added ${labels.join(", ")}`);
      return true;
    });
    if (!ok) return { success: false, error: SAME_BUYER };
    touch(shipmentId, purchaseOrderIds);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] add orders", cause);
    return { success: false, error: "We couldn't add those orders." };
  }
}

export async function removeOrderFromShipment(input: { shipmentId: string; purchaseOrderId: string }): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = z.object({ shipmentId: id, purchaseOrderId: id }).safeParse(input);
  if (!parsed.success) return { success: false, error: "That order is gone." };
  const { shipmentId, purchaseOrderId } = parsed.data;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const count = await tx.shipmentOrder.count({ where: { shipmentId } });
      if (count <= 1) return "last" as const;
      const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, select: ORDER_IDENTITY_SELECT });
      const removed = await tx.shipmentOrder.deleteMany({ where: { shipmentId, purchaseOrderId } });
      if (!removed.count || !po) return "gone" as const;
      await log(tx, shipmentId, user, "SHIPMENT_ORDER_REMOVED", `removed ${orderLabel(orderIdentity(po))}`);
      return "ok" as const;
    });
    if (result === "last") return { success: false, error: "A shipment needs at least one order. Delete the shipment instead." };
    if (result === "gone") return { success: false, error: "That order is not on this shipment." };
    touch(shipmentId, [purchaseOrderId]);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] remove order", cause);
    return { success: false, error: "We couldn't remove that order." };
  }
}

/**
 * Puts a booking on a shipment, or takes it off with null. From the BC page
 * (`bc.review`, as the PO picker it replaces) or the shipment page
 * (`shipment.manage`). Not a review: the booking's status stays.
 */
export async function linkBookingToShipment(input: { bookingId: string; shipmentId: string | null }): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage", "bc.review");
  if (!user) return { success: false, error };
  const parsed = z.object({ bookingId: id, shipmentId: id.nullable() }).safeParse(input);
  if (!parsed.success) return { success: false, error: "That booking is gone." };
  const { bookingId, shipmentId } = parsed.data;
  try {
    const before = await prisma.$transaction(async (tx) => {
      const booking = await tx.bookingConfirmation.findUnique({
        where: { id: bookingId },
        select: { shipmentId: true, bookingNumber: true, originalName: true },
      });
      if (!booking) return null;
      if (shipmentId && !(await tx.shipment.findUnique({ where: { id: shipmentId }, select: { id: true } }))) return null;
      await tx.bookingConfirmation.update({ where: { id: bookingId }, data: { shipmentId } });
      const name = booking.bookingNumber ? `booking ${booking.bookingNumber}` : booking.originalName;
      if (booking.shipmentId && booking.shipmentId !== shipmentId) {
        await log(tx, booking.shipmentId, user, "SHIPMENT_BOOKING_UNLINKED", `took ${name} off`);
      }
      if (shipmentId && booking.shipmentId !== shipmentId) {
        await log(tx, shipmentId, user, "SHIPMENT_BOOKING_LINKED", `linked ${name}`);
      }
      return booking;
    });
    if (!before) return { success: false, error: "That booking or shipment is gone." };
    revalidatePath(`/booking-confirmations/${bookingId}`);
    for (const sid of [before.shipmentId, shipmentId]) if (sid) touch(sid);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] link booking", cause);
    return { success: false, error: "We couldn't link that booking." };
  }
}

/** Removes the current file of a slot; earlier versions stay. */
export async function deleteShipmentDocument(input: { id: string }): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = id.safeParse(input.id);
  if (!parsed.success) return { success: false, error: "That file is gone." };
  try {
    const doc = await prisma.shipmentDocument.findFirst({
      where: { id: parsed.data, supersededAt: null },
      select: { r2Key: true, shipmentId: true, type: true, originalName: true },
    });
    if (!doc) return { success: false, error: "Only the current file can be deleted." };
    await prisma.$transaction([
      prisma.shipmentDocument.delete({ where: { id: parsed.data } }),
      prisma.shipmentEvent.create({
        data: {
          shipmentId: doc.shipmentId,
          actorId: user.id,
          actorName: user.name,
          action: "SHIPMENT_DOC_DELETED",
          text: `deleted the ${SLOT_LABEL[doc.type].toLowerCase()} ${doc.originalName}`,
        },
      }),
    ]);
    await deleteObject(doc.r2Key).catch((cause) => console.error("[shipments] could not delete the object", cause));
    touch(doc.shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] delete document", cause);
    return { success: false, error: "We couldn't delete that file." };
  }
}

/** Only an empty shipment: no files and no booking. Its orders are untouched. */
export async function deleteShipment(input: { id: string }): Promise<ActionResult> {
  const { user, error } = await guard("shipment.manage");
  if (!user) return { success: false, error };
  const parsed = id.safeParse(input.id);
  if (!parsed.success) return { success: false, error: "That shipment is gone." };
  try {
    const s = await prisma.shipment.findUnique({
      where: { id: parsed.data },
      select: { _count: { select: { documents: true, bookings: true } }, orders: { select: { purchaseOrderId: true } } },
    });
    if (!s) return { success: false, error: "That shipment is gone." };
    if (s._count.documents || s._count.bookings) {
      return { success: false, error: "Remove its files and booking first." };
    }
    await prisma.shipment.delete({ where: { id: parsed.data } });
    revalidatePath(LIST);
    for (const o of s.orders) revalidatePath(`/purchase-orders/${o.purchaseOrderId}`);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] delete", cause);
    return { success: false, error: "We couldn't delete that shipment." };
  }
}

/** Sets the customs form's K2/K3/K4 label on its current file. */
export async function setCustomsLabel(input: { id: string; label: string | null }): Promise<ActionResult> {
  const { error } = await guard("shipment.manage");
  if (error) return { success: false, error };
  const parsed = z.object({ id, label: text(20) }).safeParse(input);
  if (!parsed.success) return { success: false, error: "That label is too long." };
  try {
    const doc = await prisma.shipmentDocument.updateManyAndReturn({
      where: { id: parsed.data.id, type: ShipmentDocType.CUSTOMS_FORM, supersededAt: null },
      data: { label: parsed.data.label ?? null },
      select: { shipmentId: true },
    });
    if (!doc[0]) return { success: false, error: "That file is gone." };
    touch(doc[0].shipmentId);
    return { success: true, data: undefined };
  } catch (cause) {
    console.error("[shipments] customs label", cause);
    return { success: false, error: "We couldn't save that label." };
  }
}
