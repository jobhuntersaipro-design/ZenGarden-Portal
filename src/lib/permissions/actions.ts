import { PoStage } from "@/generated/prisma/enums";

export const PERMISSION_GROUPS = [
  "Dashboard",
  "Purchase orders",
  "Fulfilment",
  "Catalogue",
  "Buyers",
  "Administration",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

/**
 * Every permission the portal knows about — Phase 48.
 *
 * Adding one is a code change and no migration: an unseeded key falls back to
 * its default in `defaults.ts` until somebody saves the grid.
 *
 * Declared `as const` and re-exported through a typed view below, so `key`
 * stays a literal union (a typo in `requirePermission` fails the build) while
 * `locked` is still readable on every element.
 */
const RAW_ACTIONS = [
  {
    key: "dashboard.view",
    label: "Dashboard",
    description: "See sales, fulfilment and buyer trends on the home page.",
    group: "Dashboard",
  },
  {
    key: "po.view",
    label: "Purchase orders",
    description:
      "Open the order list and any order's detail, document and download.",
    group: "Purchase orders",
  },
  {
    key: "po.upload",
    label: "Upload a purchase order",
    description: "Upload a PO for auto extraction",
    group: "Purchase orders",
  },
  {
    key: "po.review",
    label: "Review an extracted order",
    description: "Correct Claude's reading on the review screen and save a draft.",
    group: "Purchase orders",
  },
  {
    key: "po.confirm",
    label: "Confirm or decline an order",
    description:
      "Turn a draft or a shop order into a live purchase order, or decline it.",
    group: "Purchase orders",
  },
  {
    key: "po.edit",
    label: "Edit a purchase order",
    description:
      "Change PO date, expected delivery, payment terms and the remark.",
    group: "Purchase orders",
  },
  {
    key: "po.delete",
    label: "Delete a purchase order",
    description: "Remove an order permanently. Cannot be undone.",
    group: "Purchase orders",
  },
  {
    key: "po.advance.order_placed",
    label: "Advance: Order placed → In production",
    description: "Start production on an order the team has confirmed.",
    group: "Fulfilment",
  },
  {
    key: "po.advance.in_production",
    label: "Advance: In production → QC passed",
    description: "Sign off quality control on a finished batch.",
    group: "Fulfilment",
  },
  {
    key: "po.advance.qc_passed",
    label: "Advance: QC passed → In warehouse",
    description: "Book a passed batch into the warehouse.",
    group: "Fulfilment",
  },
  {
    key: "po.advance.in_warehouse",
    label: "Advance: In warehouse → Delivering",
    description: "Release a warehoused order to the carrier.",
    group: "Fulfilment",
  },
  {
    key: "po.advance.delivering",
    label: "Advance: Delivering → Delivered",
    description: "Mark a delivery as received by the buyer.",
    group: "Fulfilment",
  },
  {
    key: "po.revert",
    label: "Move an order back a stage",
    description: "Undo a stage move. Always asks for a reason and records it.",
    group: "Fulfilment",
  },
  {
    key: "product.view",
    label: "Products",
    description: "Browse the catalogue, product pages and their order history.",
    group: "Catalogue",
  },
  {
    key: "product.manage",
    label: "Manage products",
    description: "Add, edit, publish, image and delete catalogue products.",
    group: "Catalogue",
  },
  {
    key: "buyer.view",
    label: "Buyers",
    description: "Browse the buyer roster and each buyer's orders and trends.",
    group: "Buyers",
  },
  {
    key: "buyer.manage",
    label: "Manage buyers",
    description: "Add, edit and delete buyers, their contacts and shop logins.",
    group: "Buyers",
  },
  {
    key: "user.manage",
    label: "Manage users",
    description: "Add, edit, disable and delete portal users and set their role.",
    group: "Administration",
    locked: true,
  },
  {
    key: "permission.manage",
    label: "Manage permissions",
    description: "Change this grid — who may do what.",
    group: "Administration",
    locked: true,
  },
  {
    key: "org.settings",
    label: "Company details",
    description: "Edit the supplier name, address and contact shown to buyers.",
    group: "Administration",
    locked: true,
  },
] as const;

export type PermissionKey = (typeof RAW_ACTIONS)[number]["key"];

export type PermissionAction = {
  /** Stable. Stored in the database. Never renamed. */
  key: PermissionKey;
  /** The grid's first column. */
  label: string;
  /** One line under the label, saying what the row actually permits. */
  description: string;
  group: PermissionGroup;
  /**
   * Shown in the grid, not editable. Everything under `/admin` is
   * super-admin-only structurally — `src/proxy.ts` imports no Prisma and
   * cannot consult the grid. See `docs/specs/48-role-based-access.md` §7.
   */
  locked?: true;
};

export const PERMISSION_ACTIONS: readonly PermissionAction[] = RAW_ACTIONS;

const KEYS: ReadonlySet<string> = new Set(
  PERMISSION_ACTIONS.map((action) => action.key),
);

export const isPermissionKey = (value: string): value is PermissionKey =>
  KEYS.has(value);

export const permissionAction = (key: PermissionKey): PermissionAction =>
  PERMISSION_ACTIONS.find((action) => action.key === key)!;

/**
 * The key for advancing *out of* a stage.
 *
 * Named for the stage it moves from, so the server derives it from the row it
 * just read rather than from anything the caller sent. DELIVERED has none —
 * `nextStage` returns null there and the action refuses first.
 */
export function advanceKeyFor(stage: PoStage): PermissionKey | null {
  const key = `po.advance.${stage.toLowerCase()}`;
  return isPermissionKey(key) ? key : null;
}
