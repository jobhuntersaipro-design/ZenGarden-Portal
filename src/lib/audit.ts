import type { Prisma } from "@/generated/prisma/client";
import type { AuditAction } from "@/generated/prisma/enums";

/**
 * Anything that can write the table: the Prisma client itself, or an open
 * transaction. Structural, so a call site reads identically inside and outside
 * a `$transaction` and an audit write can never drift out of the transaction
 * whose action it describes.
 */
export type AuditWriter = {
  auditEvent: Pick<Prisma.TransactionClient["auditEvent"], "create">;
};

/** Field names, counts and references. Never a secret — see the model doc. */
export type AuditDetail = Record<string, string | number | boolean | string[] | null>;

export type AuditInput = {
  action: AuditAction;
  actorId?: string | null;
  buyerId?: string | null;
  subjectUserId?: string | null;
  detail?: AuditDetail;
};

export function audit(writer: AuditWriter, event: AuditInput) {
  return writer.auditEvent.create({
    data: {
      action: event.action,
      actorId: event.actorId ?? null,
      buyerId: event.buyerId ?? null,
      subjectUserId: event.subjectUserId ?? null,
      // `undefined` leaves the column unset; `null` would write a JSON null,
      // which `readDetail` would then have to tell apart from "no detail".
      detail: event.detail ?? undefined,
    },
    select: { id: true },
  });
}

/**
 * Which keys of a patch actually differ from the row it is about to update.
 *
 * A form resubmits every input it holds, so a patch naming eight fields
 * usually changes one. Without this, every edit would be recorded as "edited
 * name, contact, email, phone, address, payment terms, remark" and the trail
 * would say nothing.
 */
export function changedFields(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  return Object.keys(patch)
    .filter((key) => patch[key] !== undefined && patch[key] !== current[key])
    .sort();
}
