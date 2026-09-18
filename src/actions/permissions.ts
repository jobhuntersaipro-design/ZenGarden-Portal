"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuditAction, Role } from "@/generated/prisma/enums";
import { UnauthorizedError } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions/require";
import { isPermissionKey, permissionAction } from "@/lib/permissions/actions";
import { OPS_ROLES } from "@/lib/permissions/roles";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

const changeSchema = z.object({
  role: z.enum(OPS_ROLES),
  action: z.string().refine(isPermissionKey, "That permission does not exist."),
  granted: z.boolean(),
});

// One save is one grid; 200 is comfortably above five roles × twenty actions.
const changesSchema = z.array(changeSchema).min(1).max(200);

export type PermissionChange = z.infer<typeof changeSchema>;

/**
 * The only writer of `PermissionGrant`.
 *
 * It refuses the super admin column and the locked Administration rows. The
 * runtime does not depend on either refusal — `roleCan` short-circuits a super
 * admin without reading the table, and `/admin` is gated by the proxy — but a
 * grid that accepted a change it then ignored would be worse than one that
 * says no.
 *
 * The whole batch is checked before anything is written, so a grid with one
 * illegal cell saves nothing rather than half of itself.
 */
export async function updatePermissions(
  changes: PermissionChange[],
): Promise<ActionResult<{ changed: number }>> {
  let actorId: string;
  try {
    actorId = (await requirePermission("permission.manage")).id;
  } catch (cause) {
    return {
      success: false,
      error:
        cause instanceof UnauthorizedError
          ? cause.message
          : "You are not signed in.",
    };
  }

  const parsed = changesSchema.safeParse(changes);
  if (!parsed.success) {
    return { success: false, error: "That change isn't valid." };
  }

  for (const change of parsed.data) {
    if (change.role === Role.SUPER_ADMIN) {
      return {
        success: false,
        error: "A super admin's permissions can't be changed.",
      };
    }
    const action = permissionAction(change.action);
    if (action.locked) {
      return {
        success: false,
        error: `${action.label} can't be changed. Everything under Admin is super admin only.`,
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const change of parsed.data) {
        await tx.permissionGrant.upsert({
          where: {
            role_action: { role: change.role, action: change.action },
          },
          create: {
            role: change.role,
            action: change.action,
            granted: change.granted,
            updatedById: actorId,
          },
          update: { granted: change.granted, updatedById: actorId },
        });
      }
      // Keys and booleans only — the audit trail never carries a person's
      // data. `buyerId` is left null: this change is about no one customer.
      await tx.auditEvent.create({
        data: {
          action: AuditAction.PERMISSIONS_CHANGED,
          actorId,
          detail: { changes: parsed.data },
        },
      });
    });
  } catch (cause) {
    console.error("[permissions] updatePermissions", cause);
    return { success: false, error: "We couldn't save those permissions." };
  }

  revalidatePath("/admin");
  return { success: true, data: { changed: parsed.data.length } };
}
