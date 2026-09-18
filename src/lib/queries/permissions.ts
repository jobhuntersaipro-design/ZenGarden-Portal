import { prisma } from "@/lib/prisma";
import { PERMISSION_ACTIONS } from "@/lib/permissions/actions";
import { OPS_ROLES } from "@/lib/permissions/roles";
import { defaultGranted } from "@/lib/permissions/defaults";
import { cellKey, type PermissionMatrix } from "@/lib/permissions/matrix";

export { cellKey };
export type { PermissionMatrix };

/**
 * Every cell the grid draws, keyed `role|action`.
 *
 * A registry key with no stored row falls back to its default rather than
 * rendering blank, so a permission added by a later phase shows its intended
 * value before anybody has saved the grid — and a row whose action has left
 * the registry is simply not drawn.
 */
export async function loadPermissionMatrix(): Promise<PermissionMatrix> {
  const rows = await prisma.permissionGrant.findMany({
    select: { role: true, action: true, granted: true },
  });
  const stored = new Map(rows.map((row) => [cellKey(row.role, row.action), row.granted]));

  const matrix: PermissionMatrix = {};
  for (const role of OPS_ROLES) {
    for (const action of PERMISSION_ACTIONS) {
      const key = cellKey(role, action.key);
      matrix[key] = stored.get(key) ?? defaultGranted(role, action.key);
    }
  }
  return matrix;
}
