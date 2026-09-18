import type { PermissionKey } from "@/lib/permissions/actions";
import type { OpsRole } from "@/lib/permissions/roles";

/**
 * The grid's cell address, `role|action`.
 *
 * Pure, and deliberately not in `src/lib/queries/permissions.ts`: that module
 * imports Prisma, and `PermissionGrid` is a client component. Importing the
 * key helper from there pulled `node:module` into the browser bundle and
 * failed the production build — which `tsc` and the whole test suite passed
 * over, because neither builds a client chunk.
 */
export const cellKey = (role: string, action: string) => `${role}|${action}`;

export type PermissionMatrix = Record<string, boolean>;

export type PermissionCell = {
  role: OpsRole;
  action: PermissionKey;
  granted: boolean;
};
