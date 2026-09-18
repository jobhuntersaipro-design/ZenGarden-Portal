import { Role } from "@/generated/prisma/enums";

/**
 * The roles the permission grid has a column for, in grid order.
 *
 * CLIENT is deliberately absent: a buyer's contact is not an ops account, and
 * `roleCan` refuses it without a lookup. MEMBER is last because it is the
 * view-only role — see `docs/specs/48-role-based-access.md` §2.
 */
export const OPS_ROLES = [
  Role.SUPER_ADMIN,
  Role.PRODUCTION_PLANNER,
  Role.QC,
  Role.WAREHOUSE,
  Role.MEMBER,
] as const;

export type OpsRole = (typeof OPS_ROLES)[number];

const LABELS: Record<Role, string> = {
  [Role.SUPER_ADMIN]: "Super admin",
  [Role.PRODUCTION_PLANNER]: "Production planner",
  [Role.QC]: "QC",
  [Role.WAREHOUSE]: "Warehouse",
  [Role.MEMBER]: "Member",
  [Role.CLIENT]: "Buyer contact",
};

/** One spelling for every screen, so the roster and the grid cannot drift. */
export const roleLabel = (role: Role): string => LABELS[role];

export const isOpsRole = (role: Role): role is OpsRole =>
  (OPS_ROLES as readonly Role[]).includes(role);
