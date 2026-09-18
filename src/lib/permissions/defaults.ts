import { Role } from "@/generated/prisma/enums";
import {
  PERMISSION_ACTIONS,
  type PermissionKey,
} from "@/lib/permissions/actions";
import { OPS_ROLES, type OpsRole } from "@/lib/permissions/roles";

/** Looking at the portal is not a privilege; every ops role starts with it. */
const VIEW_EVERYWHERE = [
  "dashboard.view",
  "po.view",
  "product.view",
  "buyer.view",
] as const satisfies readonly PermissionKey[];

/**
 * The seeded grid — `docs/specs/48-role-based-access.md` §5.
 *
 * Every cell here is a default. The whole point of the grid is that a super
 * admin changes them without a deploy.
 */
export const DEFAULT_GRANTS: Readonly<
  Record<OpsRole, readonly PermissionKey[]>
> = {
  [Role.SUPER_ADMIN]: PERMISSION_ACTIONS.map((action) => action.key),
  [Role.PRODUCTION_PLANNER]: [
    ...VIEW_EVERYWHERE,
    "po.upload",
    "po.advance.order_placed",
  ],
  [Role.QC]: [...VIEW_EVERYWHERE, "po.upload", "po.advance.in_production"],
  [Role.WAREHOUSE]: [
    ...VIEW_EVERYWHERE,
    "po.upload",
    "po.advance.qc_passed",
    "po.advance.in_warehouse",
    "po.advance.delivering",
  ],
  // The view-only role. It looks; it does not touch.
  [Role.MEMBER]: [...VIEW_EVERYWHERE],
};

export const defaultGranted = (role: OpsRole, key: PermissionKey): boolean =>
  DEFAULT_GRANTS[role].includes(key);

/** Every cell, for the seed and the migration generator. */
export function defaultRows(): {
  role: OpsRole;
  action: PermissionKey;
  granted: boolean;
}[] {
  return OPS_ROLES.flatMap((role) =>
    PERMISSION_ACTIONS.map((action) => ({
      role,
      action: action.key,
      granted: defaultGranted(role, action.key),
    })),
  );
}
