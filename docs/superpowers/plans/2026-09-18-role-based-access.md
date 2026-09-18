# Role-Based Access and the Permission Grid — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each ops job its own role, scope fulfilment stage moves to the job that owns them, and put the whole permission map in a database-backed grid a super admin edits from `/admin` without a deploy.

**Architecture:** A pure action registry (`src/lib/permissions/actions.ts`) names twenty stable permission keys. A `PermissionGrant(role, action, granted)` table stores one boolean per cell, seeded with defaults by migration. `requirePermission(key)` reads the viewer's own twenty rows once per request through React `cache()` and throws the existing `UnauthorizedError`, so every action file's current `guard()` turns it into the existing `{ success: false, error }` envelope with no change to the result shape. `can()` short-circuits `SUPER_ADMIN` to true without reading the table, which is what makes lock-out impossible.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Prisma 7 on Neon Postgres, Tailwind v4 (`@theme` tokens only), Vitest, Auth.js v5.

**Spec:** `docs/specs/48-role-based-access.md` — read it before Task 1. This plan argues from it.

## Global Constraints

- **Design system is mandatory.** No raw hex, no px font size, no arbitrary Tailwind value. Tokens from `src/app/globals.css` `@theme` only. Read `context/design-system.md` before any UI task.
- **Sentence-case labels** (`docs/specs/00-master.md` §4), except the document renderers, which this phase does not touch.
- **No `any`.** TypeScript strict. Interfaces for all props and action inputs.
- **Zod-validate every action input.** Return `{ success, data, error }`.
- **Server components by default**; `"use client"` only for interactivity.
- **44px minimum touch target below `sm`**; no horizontal overflow at 390, 768, 1440.
- **Migrations via hand-written SQL applied with `prisma migrate deploy`.** `prisma migrate dev --create-only` prompts in a way a non-TTY cannot answer and has hung this project before (2026-09-09).
- **Never remove a Postgres enum value.** Only append.
- **Tests must be watched failing before they are trusted.** Three phases here shipped tests that passed by asserting their own mock (16, 23, 41).
- **Do not touch** `src/actions/cart.ts`, `src/actions/shop-public.ts`, anything under `src/app/(storefront)/`, `src/actions/profile.ts`, `src/actions/auth.ts`, `src/lib/auth.ts`, `src/lib/auth.config.ts`, `src/proxy.ts`.
- Import `Role` from `@/generated/prisma/enums`, never from `@prisma/client`.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `src/lib/permissions/actions.ts` | The twenty keys, their labels, subtexts and groups. Pure, no Prisma, client-importable. |
| `src/lib/permissions/defaults.ts` | The default grant table (spec §5). Pure. Consumed by the migration generator, the seed and the tests. |
| `src/lib/permissions/roles.ts` | `OPS_ROLES`, `ROLE_LABELS`, `roleLabel()`. Pure, client-importable. |
| `src/lib/permissions/require.ts` | `loadGrants`, `roleCan`, `can`, `requirePermission`, `rolesWithPermission`. Server-only. |
| `src/actions/permissions.ts` | `updatePermissions` — the only writer of `PermissionGrant`. |
| `src/components/admin/PermissionGrid.tsx` | The grid. Client component. |
| `src/lib/queries/permissions.ts` | `loadPermissionMatrix()` for the admin page. |
| `prisma/migrations/20260920090000_roles_and_permission_grants/migration.sql` | Enum values + table. |
| `prisma/migrations/20260920090100_permission_grant_defaults/migration.sql` | The 100 default rows. |

**Modified** — `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/validation/users.ts`, `src/lib/queries/users.ts`, `src/components/admin/{UsersTable,UserDrawer,PendingRequests}.tsx`, `src/app/(admin)/admin/page.tsx`, `src/components/purchase-orders/LifecycleActions.tsx`, the portal pages listed in spec §11, every action file in spec §6's table, and the eleven route handlers.

---

### Task 1: Schema and the two migrations

**Files:**
- Modify: `prisma/schema.prisma` (the `Role` enum at :62, the `AuditAction` enum at :490, the `User` model's relation list)
- Create: `prisma/migrations/20260920090000_roles_and_permission_grants/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Role.PRODUCTION_PLANNER`, `Role.QC`, `Role.WAREHOUSE`; `AuditAction.PERMISSIONS_CHANGED`; `prisma.permissionGrant` with fields `{ role: Role, action: string, granted: boolean, updatedAt: Date, updatedById: string | null }` and a compound id `[role, action]`.

- [ ] **Step 1: Edit the `Role` enum**

In `prisma/schema.prisma`, replace the enum at line 62:

```prisma
/**
 * Ops roles and the shop's own.
 *
 * MEMBER predates Phase 48 and is kept rather than retired: every
 * non-super-admin ops user holds it, and retiring it would mean guessing at
 * each person's job. It is the view-only role now.
 *
 * Appended only, never reordered: `ALTER TYPE ... ADD VALUE` cannot insert.
 */
enum Role {
  SUPER_ADMIN
  MEMBER
  CLIENT
  PRODUCTION_PLANNER
  QC
  WAREHOUSE
}
```

- [ ] **Step 2: Add the audit action and the grant model**

Append `PERMISSIONS_CHANGED` as the last value of `enum AuditAction` (schema.prisma:490), and widen that enum's neighbouring doc comment on `model AuditEvent` from "Who did what to a customer's account, and when a customer signed in." to "Who did what to a customer's account, when a customer signed in, and portal-wide administrative changes such as a permission edit."

Add the model at the end of the file:

```prisma
/**
 * One row per (role, action) cell of the permission grid — Phase 48.
 *
 * `action` is a String rather than an enum on purpose: the set of actions is
 * owned by `src/lib/permissions/actions.ts` and grows with every feature, and
 * an enum would put a migration in front of every new permission. A row whose
 * action has left the registry is ignored at read time; a registry key with no
 * row denies by default.
 *
 * SUPER_ADMIN rows exist so the grid reads from one source. The runtime never
 * depends on them — `roleCan` short-circuits that role to true without reading
 * the table, so no saved edit can lock the administrators out.
 */
model PermissionGrant {
  role        Role
  action      String
  granted     Boolean
  updatedAt   DateTime @updatedAt
  /// Who last changed this cell. Null once that user's row is gone.
  updatedById String?
  updatedBy   User?    @relation("permissionEdits", fields: [updatedById], references: [id], onDelete: SetNull)

  @@id([role, action])
}
```

On `model User`, add the back-relation beside the existing ones:

```prisma
  permissionEdits    PermissionGrant[] @relation("permissionEdits")
```

- [ ] **Step 3: Write the first migration by hand**

`prisma/migrations/20260920090000_roles_and_permission_grants/migration.sql`:

```sql
-- Phase 48. Split from the defaults migration because Postgres refuses to
-- reference a newly added enum value in the transaction that added it — the
-- same rule that forced two migrations in Phase 15.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRODUCTION_PLANNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'QC';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAREHOUSE';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PERMISSIONS_CHANGED';

CREATE TABLE "PermissionGrant" (
    "role" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("role", "action")
);

ALTER TABLE "PermissionGrant"
  ADD CONSTRAINT "PermissionGrant_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply and regenerate**

```bash
npx prisma migrate deploy
npx prisma generate
```

Expected: `1 migration found`, applied. If a dev server is running, **restart it** — a server started before `prisma generate` keeps the old client and answers "Unknown field" for every new relation (recorded 2026-09-15).

- [ ] **Step 5: Verify the enum and the table exist**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
(async () => {
  const roles = await prisma.\$queryRaw\`SELECT unnest(enum_range(NULL::\"Role\"))::text AS role\`;
  console.log(roles);
  console.log('grants:', await prisma.permissionGrant.count());
  await prisma.\$disconnect();
})();
"
```

Expected: six roles including the three new ones; `grants: 0`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260920090000_roles_and_permission_grants
git commit -m "feat(rbac): add three ops roles and the PermissionGrant table"
```

---

### Task 2: The action registry, roles and defaults

**Files:**
- Create: `src/lib/permissions/actions.ts`, `src/lib/permissions/roles.ts`, `src/lib/permissions/defaults.ts`
- Test: `src/lib/permissions/defaults.test.ts`

**Interfaces:**
- Consumes: `Role` from `@/generated/prisma/enums`.
- Produces:
  - `PERMISSION_ACTIONS: readonly PermissionAction[]`, `PermissionKey` (a string union of the twenty keys), `PERMISSION_GROUPS: readonly PermissionGroup[]`, `isPermissionKey(value: string): value is PermissionKey`, `advanceKeyFor(stage: PoStage): PermissionKey | null`
  - `OPS_ROLES: readonly OpsRole[]`, `type OpsRole`, `roleLabel(role: Role): string`
  - `DEFAULT_GRANTS: Readonly<Record<OpsRole, readonly PermissionKey[]>>`, `defaultGranted(role: OpsRole, key: PermissionKey): boolean`

- [ ] **Step 1: Write the failing test**

`src/lib/permissions/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { PoStage } from "@/generated/prisma/enums";
import {
  PERMISSION_ACTIONS,
  advanceKeyFor,
  isPermissionKey,
} from "@/lib/permissions/actions";
import { OPS_ROLES, roleLabel } from "@/lib/permissions/roles";
import { defaultGranted } from "@/lib/permissions/defaults";

describe("the registry", () => {
  it("holds twenty actions with unique keys", () => {
    expect(PERMISSION_ACTIONS).toHaveLength(20);
    const keys = PERMISSION_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(20);
  });

  it("gives every action a label and a one-line description", () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
      expect(action.description.endsWith(".")).toBe(true);
    }
  });

  it("locks exactly the three administration rows", () => {
    const locked = PERMISSION_ACTIONS.filter((a) => a.locked).map((a) => a.key);
    expect(locked).toEqual(["user.manage", "permission.manage", "org.settings"]);
  });

  it("narrows an unknown key", () => {
    expect(isPermissionKey("po.edit")).toBe(true);
    expect(isPermissionKey("po.edti")).toBe(false);
  });

  it("keys an advance on the stage it moves from, and stops at delivered", () => {
    expect(advanceKeyFor(PoStage.ORDER_PLACED)).toBe("po.advance.order_placed");
    expect(advanceKeyFor(PoStage.DELIVERING)).toBe("po.advance.delivering");
    expect(advanceKeyFor(PoStage.DELIVERED)).toBeNull();
  });
});

describe("the ops roles", () => {
  it("lists five, without CLIENT", () => {
    expect(OPS_ROLES).toEqual([
      Role.SUPER_ADMIN,
      Role.PRODUCTION_PLANNER,
      Role.QC,
      Role.WAREHOUSE,
      Role.MEMBER,
    ]);
    expect(OPS_ROLES).not.toContain(Role.CLIENT);
  });

  it("labels each one in sentence case", () => {
    expect(roleLabel(Role.SUPER_ADMIN)).toBe("Super admin");
    expect(roleLabel(Role.PRODUCTION_PLANNER)).toBe("Production planner");
    expect(roleLabel(Role.WAREHOUSE)).toBe("Warehouse");
  });
});

describe("the default grants", () => {
  it("gives a super admin every action", () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(defaultGranted(Role.SUPER_ADMIN, action.key)).toBe(true);
    }
  });

  // The brief's stage table, written out as it was written.
  it.each([
    ["po.advance.order_placed",  Role.PRODUCTION_PLANNER, true],
    ["po.advance.order_placed",  Role.QC,                 false],
    ["po.advance.order_placed",  Role.WAREHOUSE,          false],
    ["po.advance.in_production", Role.PRODUCTION_PLANNER, false],
    ["po.advance.in_production", Role.QC,                 true],
    ["po.advance.in_production", Role.WAREHOUSE,          false],
    ["po.advance.qc_passed",     Role.PRODUCTION_PLANNER, false],
    ["po.advance.qc_passed",     Role.QC,                 false],
    ["po.advance.qc_passed",     Role.WAREHOUSE,          true],
    ["po.advance.in_warehouse",  Role.WAREHOUSE,          true],
    ["po.advance.delivering",    Role.WAREHOUSE,          true],
  ] as const)("%s for %s is %s", (key, role, expected) => {
    expect(defaultGranted(role, key)).toBe(expected);
  });

  it("gives nobody but a super admin move back, confirm, edit or delete", () => {
    for (const role of [Role.PRODUCTION_PLANNER, Role.QC, Role.WAREHOUSE, Role.MEMBER] as const) {
      for (const key of ["po.revert", "po.confirm", "po.edit", "po.delete", "po.review"] as const) {
        expect(defaultGranted(role, key)).toBe(false);
      }
    }
  });

  it("lets the four working roles upload and the member only look", () => {
    for (const role of [Role.PRODUCTION_PLANNER, Role.QC, Role.WAREHOUSE] as const) {
      expect(defaultGranted(role, "po.upload")).toBe(true);
    }
    expect(defaultGranted(Role.MEMBER, "po.upload")).toBe(false);
    expect(defaultGranted(Role.MEMBER, "po.view")).toBe(true);
    expect(defaultGranted(Role.MEMBER, "product.view")).toBe(true);
    expect(defaultGranted(Role.MEMBER, "buyer.view")).toBe(true);
  });

  it("gives every role a decision on every action", () => {
    for (const role of OPS_ROLES) {
      for (const action of PERMISSION_ACTIONS) {
        expect(typeof defaultGranted(role, action.key)).toBe("boolean");
      }
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/permissions/defaults.test.ts`
Expected: FAIL — cannot resolve `@/lib/permissions/actions`.

- [ ] **Step 3: Write `src/lib/permissions/roles.ts`**

```ts
import { Role } from "@/generated/prisma/enums";

/**
 * The roles the permission grid has a column for, in grid order.
 *
 * CLIENT is deliberately absent: a buyer's contact is not an ops account, and
 * `roleCan` refuses it without a lookup.
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
```

- [ ] **Step 4: Write `src/lib/permissions/actions.ts`**

```ts
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

export type PermissionAction = {
  /** Stable. Stored in the database. Never renamed. */
  key: string;
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

export const PERMISSION_ACTIONS = [
  {
    key: "dashboard.view",
    label: "Dashboard",
    description: "See sales, fulfilment and buyer trends on the home page.",
    group: "Dashboard",
  },
  {
    key: "po.view",
    label: "Purchase orders",
    description: "Open the order list and any order's detail, document and download.",
    group: "Purchase orders",
  },
  {
    key: "po.upload",
    label: "Upload a purchase order",
    description: "Send a PDF or photo of a customer PO in for Claude to read.",
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
    description: "Turn a draft or a shop order into a live purchase order, or decline it.",
    group: "Purchase orders",
  },
  {
    key: "po.edit",
    label: "Edit a purchase order",
    description: "Change PO date, expected delivery, payment terms and the remark.",
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
] as const satisfies readonly PermissionAction[];

export type PermissionKey = (typeof PERMISSION_ACTIONS)[number]["key"];

const KEYS: ReadonlySet<string> = new Set(PERMISSION_ACTIONS.map((a) => a.key));

export const isPermissionKey = (value: string): value is PermissionKey =>
  KEYS.has(value);

export const permissionAction = (key: PermissionKey): PermissionAction =>
  PERMISSION_ACTIONS.find((a) => a.key === key)!;

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
```

- [ ] **Step 5: Write `src/lib/permissions/defaults.ts`**

```ts
import { Role } from "@/generated/prisma/enums";
import { PERMISSION_ACTIONS, type PermissionKey } from "@/lib/permissions/actions";
import { OPS_ROLES, type OpsRole } from "@/lib/permissions/roles";

const VIEW_EVERYWHERE = ["dashboard.view", "po.view", "product.view", "buyer.view"] as const;

/**
 * The seeded grid — `docs/specs/48-role-based-access.md` §5.
 *
 * Every cell here is a default. The whole point of the grid is that a super
 * admin changes them without a deploy.
 */
export const DEFAULT_GRANTS: Readonly<Record<OpsRole, readonly PermissionKey[]>> = {
  [Role.SUPER_ADMIN]: PERMISSION_ACTIONS.map((a) => a.key),
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
export function defaultRows(): { role: OpsRole; action: PermissionKey; granted: boolean }[] {
  return OPS_ROLES.flatMap((role) =>
    PERMISSION_ACTIONS.map((action) => ({
      role,
      action: action.key,
      granted: defaultGranted(role, action.key),
    })),
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/permissions/defaults.test.ts`
Expected: PASS, all cases.

- [ ] **Step 7: Commit**

```bash
git add src/lib/permissions
git commit -m "feat(rbac): the action registry, the ops roles and the default grants"
```

---

### Task 3: Seed the defaults

**Files:**
- Create: `prisma/migrations/20260920090100_permission_grant_defaults/migration.sql`, `scripts/print-permission-seed.ts`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `defaultRows()` from Task 2.
- Produces: 100 rows in `PermissionGrant` on every database, dev and production.

- [ ] **Step 1: Write the generator**

`scripts/print-permission-seed.ts` — prints the SQL so the migration is generated from the same source the tests assert, not typed by hand:

```ts
import { defaultRows } from "../src/lib/permissions/defaults";

const values = defaultRows()
  .map((r) => `  ('${r.role}', '${r.action}', ${r.granted}, NOW())`)
  .join(",\n");

console.log(`-- Phase 48 default grants. Generated by scripts/print-permission-seed.ts
-- from src/lib/permissions/defaults.ts. Do not hand-edit: regenerate.
INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
${values}
ON CONFLICT ("role", "action") DO NOTHING;`);
```

- [ ] **Step 2: Generate the migration**

```bash
mkdir -p prisma/migrations/20260920090100_permission_grant_defaults
npx tsx scripts/print-permission-seed.ts > prisma/migrations/20260920090100_permission_grant_defaults/migration.sql
head -5 prisma/migrations/20260920090100_permission_grant_defaults/migration.sql
wc -l prisma/migrations/20260920090100_permission_grant_defaults/migration.sql
```

Expected: 104 lines (3 comment/INSERT + 100 values + 1 conflict clause).

- [ ] **Step 3: Apply it**

```bash
npx prisma migrate deploy
```

Expected: `1 migration found`, applied.

- [ ] **Step 4: Verify the rows against the registry, not against themselves**

```bash
npx tsx -e "
import { prisma } from './src/lib/prisma';
import { defaultRows } from './src/lib/permissions/defaults';
(async () => {
  const stored = await prisma.permissionGrant.findMany();
  const want = defaultRows();
  console.log('rows', stored.length, 'expected', want.length);
  const key = (r: {role: string; action: string}) => r.role + '|' + r.action;
  const map = new Map(stored.map((r) => [key(r), r.granted]));
  const wrong = want.filter((w) => map.get(key(w)) !== w.granted);
  console.log('mismatched', wrong.length, wrong.slice(0, 5));
  await prisma.\$disconnect();
})();
"
```

Expected: `rows 100 expected 100`, `mismatched 0 []`.

- [ ] **Step 5: Make a fresh clone work**

In `prisma/seed.ts`, immediately before the `const counts = {` block, add:

```ts
  // Phase 48: the grid has to exist on a fresh clone, not only where the
  // migration ran. Same source as the migration, so the two cannot drift.
  await prisma.permissionGrant.createMany({
    data: defaultRows().map((row) => ({ ...row, updatedAt: new Date() })),
    skipDuplicates: true,
  });
```

and at the top of the file, beside the other imports:

```ts
import { defaultRows } from "../src/lib/permissions/defaults";
```

Add `permissionGrants: await prisma.permissionGrant.count(),` to the `counts` object so the seed's own table prints it.

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/20260920090100_permission_grant_defaults prisma/seed.ts scripts/print-permission-seed.ts
git commit -m "feat(rbac): seed the default permission grid"
```

---

### Task 4: `requirePermission` and friends

**Files:**
- Create: `src/lib/permissions/require.ts`
- Test: `src/lib/permissions/require.test.ts`

**Interfaces:**
- Consumes: `PermissionKey`, `OPS_ROLES`, `getSessionUser`, `requireUser`, `UnauthorizedError`, `prisma`.
- Produces:
  - `loadGrants(role: Role): Promise<ReadonlySet<string>>`
  - `roleCan(role: Role, key: PermissionKey): Promise<boolean>`
  - `can(key: PermissionKey): Promise<boolean>`
  - `requirePermission(key: PermissionKey, message?: string): Promise<SessionUser>`
  - `rolesWithPermission(key: PermissionKey): Promise<Role[]>`

- [ ] **Step 1: Write the failing test**

`src/lib/permissions/require.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { permissionGrant: { findMany: () => findMany() } },
}));

const getSessionUser = vi.fn();
const requireUser = vi.fn();
vi.mock("@/lib/auth-guards", () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  getSessionUser: () => getSessionUser(),
  requireUser: () => requireUser(),
}));
// React cache() is identity outside a request; make that explicit.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: (fn: unknown) => fn };
});

const load = async () => await import("@/lib/permissions/require");

beforeEach(() => {
  vi.resetModules();
  findMany.mockReset();
  getSessionUser.mockReset();
  requireUser.mockReset();
});

describe("roleCan", () => {
  it("is true for a super admin without reading the table", async () => {
    // A table that denies everything. The short circuit is the lock-out
    // guarantee: no saved edit and no corrupt row may take the portal away.
    findMany.mockResolvedValue([]);
    const { roleCan } = await load();
    expect(await roleCan(Role.SUPER_ADMIN, "po.delete")).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("is false for a client even when the table grants it", async () => {
    findMany.mockResolvedValue([{ action: "po.view" }]);
    const { roleCan } = await load();
    expect(await roleCan(Role.CLIENT, "po.view")).toBe(false);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads the table for every other role", async () => {
    findMany.mockResolvedValue([{ action: "po.advance.order_placed" }]);
    const { roleCan } = await load();
    expect(await roleCan(Role.PRODUCTION_PLANNER, "po.advance.order_placed")).toBe(true);
    expect(await roleCan(Role.PRODUCTION_PLANNER, "po.advance.qc_passed")).toBe(false);
  });

  it("denies a key with no row at all", async () => {
    findMany.mockResolvedValue([]);
    const { roleCan } = await load();
    expect(await roleCan(Role.WAREHOUSE, "po.confirm")).toBe(false);
  });
});

describe("requirePermission", () => {
  it("returns the user when the grant is there", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.WAREHOUSE });
    findMany.mockResolvedValue([{ action: "po.advance.delivering" }]);
    const { requirePermission } = await load();
    await expect(requirePermission("po.advance.delivering")).resolves.toMatchObject({ id: "u1" });
  });

  it("throws when it is not", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.WAREHOUSE });
    findMany.mockResolvedValue([]);
    const { requirePermission } = await load();
    await expect(requirePermission("po.confirm")).rejects.toThrow();
  });

  it("carries the caller's own message when given one", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.QC });
    findMany.mockResolvedValue([]);
    const { requirePermission } = await load();
    await expect(
      requirePermission("po.advance.qc_passed", "Warehouse advances this stage."),
    ).rejects.toThrow("Warehouse advances this stage.");
  });
});

describe("can", () => {
  it("is false for a guest", async () => {
    getSessionUser.mockResolvedValue(null);
    const { can } = await load();
    expect(await can("po.view")).toBe(false);
  });
});

describe("rolesWithPermission", () => {
  it("names the ops roles that hold a key, super admin always included", async () => {
    findMany.mockResolvedValue([{ role: Role.WAREHOUSE }]);
    const { rolesWithPermission } = await load();
    expect(await rolesWithPermission("po.advance.qc_passed")).toEqual([
      Role.SUPER_ADMIN,
      Role.WAREHOUSE,
    ]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/permissions/require.test.ts`
Expected: FAIL — cannot resolve `@/lib/permissions/require`.

- [ ] **Step 3: Write the implementation**

`src/lib/permissions/require.ts`:

```ts
import "server-only";
import { cache } from "react";
import { Role } from "@/generated/prisma/enums";
import {
  UnauthorizedError,
  getSessionUser,
  requireUser,
  type SessionUser,
} from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { OPS_ROLES } from "@/lib/permissions/roles";
import { permissionAction, type PermissionKey } from "@/lib/permissions/actions";

/**
 * The viewer's own granted keys.
 *
 * `cache()` dedupes within one request and nothing caches across requests: at
 * most twenty rows for one role, and a saved grid is live on the very next
 * request with nothing to invalidate and no deploy. That is the strictest
 * reading of the brief's "cache OK, invalidate on save".
 */
export const loadGrants = cache(async (role: Role): Promise<ReadonlySet<string>> => {
  const rows = await prisma.permissionGrant.findMany({
    where: { role, granted: true },
    select: { action: true },
  });
  return new Set(rows.map((row) => row.action));
});

export async function roleCan(role: Role, key: PermissionKey): Promise<boolean> {
  // A shop account is not an ops account, whatever the table says.
  if (role === Role.CLIENT) return false;
  // The lock-out guarantee. Stronger than disabling the column in the grid,
  // because no saved edit, no direct SQL write and no corrupt row can take
  // the portal away from its administrators. The stored SUPER_ADMIN rows
  // exist so the grid reads from one source; the runtime ignores them.
  if (role === Role.SUPER_ADMIN) return true;
  return (await loadGrants(role)).has(key);
}

/** For rendering. Never the only check — see `requirePermission`. */
export async function can(key: PermissionKey): Promise<boolean> {
  const user = await getSessionUser();
  return user ? roleCan(user.role, key) : false;
}

/**
 * The guard. Throws `UnauthorizedError`, which every action file's local
 * `guard()` already catches and turns into `{ success: false, error }`.
 */
export async function requirePermission(
  key: PermissionKey,
  message?: string,
): Promise<SessionUser> {
  const user = await requireUser();
  if (await roleCan(user.role, key)) return user;
  throw new UnauthorizedError(
    message ?? `Your role can't ${permissionAction(key).label.toLowerCase()}.`,
  );
}

/**
 * Which ops roles hold a key — for the disabled Advance button's reason, so
 * it can say who *does* advance this stage rather than only that you do not.
 */
export async function rolesWithPermission(key: PermissionKey): Promise<Role[]> {
  const rows = await prisma.permissionGrant.findMany({
    where: { action: key, granted: true, role: { not: Role.SUPER_ADMIN } },
    select: { role: true },
  });
  const held = new Set<Role>(rows.map((row) => row.role));
  return OPS_ROLES.filter((role) => role === Role.SUPER_ADMIN || held.has(role));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/permissions/require.test.ts`
Expected: PASS.

- [ ] **Step 5: Check `server-only` against the test runner**

`vitest.config.mts` already aliases `server-only` to the package's own `empty.js` (Phase 37). Confirm the alias covers this file:

Run: `npx vitest run src/lib/permissions/`
Expected: PASS, both files. If it throws on the `server-only` import, the alias is missing — add it as Phase 37 did rather than dropping the marker.

- [ ] **Step 6: Commit**

```bash
git add src/lib/permissions/require.ts src/lib/permissions/require.test.ts
git commit -m "feat(rbac): requirePermission, with super admin short-circuited"
```

---

### Task 5: Stage moves become stage-scoped

**Files:**
- Modify: `src/actions/stages.ts` (`advanceStage` :96, `revertStage` :149, `updatePurchaseOrder` :250, the imports)
- Test: `src/actions/stages.test.ts`

**Interfaces:**
- Consumes: `requirePermission`, `advanceKeyFor`, `rolesWithPermission`, `roleLabel`.
- Produces: `advanceStage` refuses a stage the role does not own; `revertStage` uses `po.revert`; `updatePurchaseOrder` uses `po.edit`.

- [ ] **Step 1: Write the failing tests**

Append to `src/actions/stages.test.ts`. The file already mocks `@/lib/auth-guards`; add a mock for the permission module beside it, near the top with the others:

```ts
const requirePermission = vi.fn();
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string, message?: string) => requirePermission(key, message),
  rolesWithPermission: vi.fn().mockResolvedValue([]),
}));
```

and the cases:

```ts
describe("advanceStage is scoped to the stage the role owns", () => {
  it("asks for the key of the stage it just read, not the one it moves to", async () => {
    poFindUnique.mockResolvedValue({ stage: PoStage.QC_PASSED });
    poUpdateMany.mockResolvedValue({ count: 1 });
    requirePermission.mockResolvedValue({ id: "u1", role: Role.WAREHOUSE });

    const { advanceStage } = await import("@/actions/stages");
    const result = await advanceStage("po1");

    expect(result).toEqual({ success: true, data: { stage: PoStage.IN_WAREHOUSE } });
    expect(requirePermission).toHaveBeenCalledWith(
      "po.advance.qc_passed",
      expect.any(String),
    );
  });

  it("refuses, and writes nothing, when the role does not own the stage", async () => {
    poFindUnique.mockResolvedValue({ stage: PoStage.QC_PASSED });
    requirePermission.mockRejectedValue(new UnauthorizedErrorStub("Warehouse advances this stage."));

    const { advanceStage } = await import("@/actions/stages");
    const result = await advanceStage("po1");

    expect(result).toEqual({ success: false, error: "Warehouse advances this stage." });
    expect(poUpdateMany).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });
});

describe("revertStage", () => {
  it("asks for po.revert", async () => {
    poFindUnique.mockResolvedValue({ stage: PoStage.QC_PASSED });
    poUpdateMany.mockResolvedValue({ count: 1 });
    requirePermission.mockResolvedValue({ id: "u1", role: Role.SUPER_ADMIN });

    const { revertStage } = await import("@/actions/stages");
    await revertStage("po1", "wrong batch");

    expect(requirePermission).toHaveBeenCalledWith("po.revert");
  });

  it("still requires a note", async () => {
    requirePermission.mockResolvedValue({ id: "u1", role: Role.SUPER_ADMIN });
    const { revertStage } = await import("@/actions/stages");
    const result = await revertStage("po1", "   ");
    expect(result).toEqual({
      success: false,
      error: "A note is required when moving back.",
    });
  });
});
```

`UnauthorizedErrorStub` is the class the existing `@/lib/auth-guards` mock already defines — export it from that mock factory so the test can construct one.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/actions/stages.test.ts`
Expected: FAIL — `requirePermission` never called; the action still uses `guard()`.

- [ ] **Step 3: Rewrite the guard in `advanceStage`**

Replace the body's opening of `advanceStage` (currently `const { user, error } = await guard();` before the `try`) so the permission check happens **after** the order is read, because the key comes from the stored row:

```ts
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
    if (!target) {
      return { success: false, error: "This order is already delivered." };
    }

    // The key comes from the row we just read, never from the caller. A
    // planner forging a request against a QC-passed order is refused by the
    // same fact that hides their button.
    const key = advanceKeyFor(po.stage);
    if (!key) return { success: false, error: "This order is already delivered." };
    const user = await requirePermission(key, await advanceDeniedMessage(key));

    const moved = await prisma.$transaction(async (tx) => {
      // … unchanged from here: the updateMany guarded on po.stage, then the
      // poStageEvent.create with changedById: user.id
```

and add, above `advanceStage`:

```ts
/**
 * Who *does* advance this stage — a refusal that only says "not you" sends
 * someone to ask an admin; one that names the role sends them to the right
 * colleague.
 */
async function advanceDeniedMessage(key: PermissionKey): Promise<string> {
  const roles = (await rolesWithPermission(key)).filter(
    (role) => role !== Role.SUPER_ADMIN,
  );
  if (roles.length === 0) return "Only a super admin advances this stage.";
  return `${roles.map(roleLabel).join(" or ")} advances this stage.`;
}
```

Update the doc comment above `advanceStage` from "Any member may do this." to "Only a role that owns this stage may do this — the key is derived from the stored stage, so a forged request is refused by the same fact that hides the button."

- [ ] **Step 4: Rewrite `revertStage` and `updatePurchaseOrder`**

In `revertStage`, replace:

```ts
  const { user, error } = await guard();
  if (!user) return { success: false, error: error! };
  // Checked here, not only in the UI: the button being hidden is not a permission check.
  if (user.role !== Role.SUPER_ADMIN) {
    return { success: false, error: "Only a super admin can move an order back." };
  }
  if (!note.trim()) {
```

with:

```ts
  // Phase 48: this was the codebase's one inline role comparison. The grid
  // owns it now. Checked here, not only in the UI: the button being hidden is
  // not a permission check.
  const { user, error } = await guardPermission("po.revert");
  if (!user) return { success: false, error: error! };
  if (!note.trim()) {
```

In `updatePurchaseOrder`, replace its `const { user, error } = await guard();` with `const { user, error } = await guardPermission("po.edit");`.

Replace the module's `guard` (:70) with a permission-aware one, keeping the same shape so every caller's two lines are unchanged:

```ts
const guardPermission = async (key: PermissionKey) => {
  try {
    return { user: await requirePermission(key), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};
```

Add the imports and drop the now-unused ones:

```ts
import { advanceKeyFor, type PermissionKey } from "@/lib/permissions/actions";
import { requirePermission, rolesWithPermission } from "@/lib/permissions/require";
import { roleLabel } from "@/lib/permissions/roles";
```

`requireUser` is no longer imported by this file; `Role` still is, for `advanceDeniedMessage`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/actions/stages.test.ts`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 6: Watch the new guard fail**

Temporarily comment out the `const user = await requirePermission(...)` line in `advanceStage` and substitute `const user = { id: "u1" };`.

Run: `npx vitest run src/actions/stages.test.ts -t "refuses, and writes nothing"`
Expected: **FAIL** — the action advances. Restore the line and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions/stages.ts src/actions/stages.test.ts
git commit -m "feat(rbac): scope stage advances to the role that owns the stage"
```

---

### Task 6: The purchase-order and web-order actions

**Files:**
- Modify: `src/actions/purchase-orders.ts`, `src/actions/web-orders.ts`, `src/actions/buyers.ts`
- Test: `src/actions/confirm.test.ts`, `src/actions/confirm-web-order.test.ts`, `src/actions/buyers.test.ts`

**Interfaces:**
- Consumes: `requirePermission`.
- Produces: the guards in spec §6's table for `po.upload`, `po.review`, `po.confirm`, `po.delete`, `buyer.manage`.

- [ ] **Step 1: Write the failing tests**

In each of the three test files, add the same permission mock beside the existing `@/lib/auth-guards` mock:

```ts
const requirePermission = vi.fn();
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => requirePermission(key),
}));
```

and a refusal case per action. For `src/actions/confirm.test.ts`:

```ts
it("refuses to confirm without po.confirm, and writes nothing", async () => {
  requirePermission.mockRejectedValue(new UnauthorizedErrorStub("Your role can't confirm or decline an order."));
  const { confirmPurchaseOrder } = await import("@/actions/purchase-orders");
  const result = await confirmPurchaseOrder(validInput);
  expect(result).toEqual({
    success: false,
    error: "Your role can't confirm or decline an order.",
  });
  expect(poCreate).not.toHaveBeenCalled();
});
```

For `src/actions/confirm-web-order.test.ts`, the same shape against `confirmWebOrder` and `declineWebOrder`, asserting `webOrderUpdateMany` was not called. For `src/actions/buyers.test.ts`, against `updateBuyer` with `"buyer.manage"`, asserting `buyerUpdate` was not called.

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/actions/confirm.test.ts src/actions/confirm-web-order.test.ts src/actions/buyers.test.ts`
Expected: FAIL — the actions still succeed.

- [ ] **Step 3: Swap the guards in `purchase-orders.ts`**

Replace the module `guard` (:35) with the permission-aware form:

```ts
const guardPermission = async (key: PermissionKey) => {
  try {
    return { user: await requirePermission(key), error: null as string | null };
  } catch (cause) {
    return {
      user: null,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }
};
```

Then, per export, change the one `await guard()` line to `await guardPermission(<key>)`:

| Export | Key |
|---|---|
| `saveDraft` :51 | `"po.review"` |
| `checkDuplicate` :111 | `"po.review"` |
| `confirmPurchaseOrder` :344 | `"po.confirm"` |
| `discardExtraction` :476 | `"po.review"` |
| `getExtractionStatus` :504 | `"po.upload"` |
| `retryExtraction` :522 | `"po.review"` |

`deletePurchaseOrder` :570 and `deleteUpload` :654 call their guard directly rather than through `guard()`; replace `await requireSuperAdmin()` with `await requirePermission("po.delete")` and `await requireUser()` with `await requirePermission("po.upload")` respectively.

Add above `getExtractionStatus`:

```ts
// po.upload, not po.review: this is what the upload queue polls to turn a row
// from "Extracting" into "Ready", so a role that may upload must be able to
// watch its own upload finish. It reads a status and a failure reason, never
// the extracted draft.
```

Extend `writePurchaseOrder`'s doc comment (:198) with: "Exported but not an entry point: it takes an open transaction and every caller has already run its own permission guard. It stays unguarded deliberately — adding one here would run a second query inside every confirm."

- [ ] **Step 4: Swap the guards in `web-orders.ts` and `buyers.ts`**

`web-orders.ts`: replace the module `guard` (:47) with the same `guardPermission` helper, then `confirmWebOrder` :70 → `"po.confirm"`, `declineWebOrder` :265 → `"po.confirm"`. `deleteWebOrder` :352 calls `requireSuperAdmin()` directly → `requirePermission("po.delete")`.

`buyers.ts`: in `updateBuyer` :38 replace `await requireUser()` with `await requirePermission("buyer.manage")`, and **delete** the inline block at :62 that gated only the `name` field on `role !== SUPER_ADMIN` — the whole row is `buyer.manage` now. Leave a comment where it was:

```ts
  // Phase 48: the name field used to be super-admin-only while the rest of the
  // row was any member's. The whole row is `buyer.manage` now.
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/actions/`
Expected: PASS.

- [ ] **Step 6: Watch one guard fail**

In `confirmWebOrder`, replace `await guardPermission("po.confirm")` with `await guardPermission("po.view")` and set the mock to grant `po.view`.

Run: `npx vitest run src/actions/confirm-web-order.test.ts`
Expected: **FAIL** on the refusal case. Restore and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions/purchase-orders.ts src/actions/web-orders.ts src/actions/buyers.ts src/actions/*.test.ts
git commit -m "feat(rbac): gate PO intake, confirm, delete and buyer edits on the grid"
```

---

### Task 7: The remaining actions and the API routes

**Files:**
- Modify: `src/actions/{products,product-families,catalog-labels,users,clients,admin-buyers,reset-links,org-settings,listings}.ts`
- Modify: the eleven route handlers under `src/app/api/`
- Test: the matching `*.test.ts` files

**Interfaces:**
- Consumes: `requirePermission`.
- Produces: every remaining mutating entry point gated on a registry key; API routes answer **403**.

- [ ] **Step 1: Swap the action guards**

Each of these files defines a module `guard()` wrapping `requireSuperAdmin()` (or calls it directly). Replace the wrapped call with `requirePermission(<key>)`:

| File | Key |
|---|---|
| `products.ts` :45 | `"product.manage"` |
| `product-families.ts` :28 | `"product.manage"` |
| `catalog-labels.ts` :38 | `"product.manage"` |
| `listings.ts` :32 | `"product.manage"` |
| `admin-buyers.ts` :50, :168 | `"buyer.manage"` |
| `clients.ts` :32 | `"buyer.manage"` |
| `users.ts` :40 | `"user.manage"` |
| `reset-links.ts` :52 | `"user.manage"` |
| `org-settings.ts` :23 | `"org.settings"` |

The three Administration keys default to super-admin-only and are locked in the grid, so behaviour is identical today — but the call sites now read from one place.

- [ ] **Step 2: Give the API routes a real 403**

Add to `src/lib/permissions/require.ts`:

```ts
/**
 * For route handlers, which answer with a status rather than an envelope.
 * 403, not 401: the caller is authenticated and simply may not do this.
 */
export async function requirePermissionResponse(
  key: PermissionKey,
): Promise<{ user: SessionUser } | { response: Response }> {
  try {
    return { user: await requirePermission(key) };
  } catch (cause) {
    const message =
      cause instanceof UnauthorizedError ? cause.message : "You are not signed in.";
    const status = message === "You are not signed in." ? 401 : 403;
    return {
      response: Response.json({ error: message }, { status }),
    };
  }
}
```

Then in each route, replace the existing guard block with:

```ts
  const gate = await requirePermissionResponse("po.upload");
  if ("response" in gate) return gate.response;
  const user = gate.user;
```

| Route | Key |
|---|---|
| `api/upload/presign` :42 | `"po.upload"` |
| `api/upload/complete` :30 | `"po.upload"` |
| `api/upload/[documentId]` DELETE :18 | `"po.upload"` |
| `api/documents/[documentId]/url` :29 | `"po.view"` |
| `api/review-queue/count` :19 | `"po.view"` |
| `api/products/[id]/images/presign` :42 | `"product.manage"` |
| `api/products/[id]/images/complete` :18 | `"product.manage"` |

`api/avatars` (both) stay on `requireUser()` — an avatar is self-scoped and no role governs it. `api/shop/documents/[documentId]/url` stays on `requireClient()`, untouched.

- [ ] **Step 3: Write the route test**

`src/lib/permissions/require.test.ts`, appended:

```ts
describe("requirePermissionResponse", () => {
  it("answers 403 for a signed-in user who may not", async () => {
    requireUser.mockResolvedValue({ id: "u1", role: Role.MEMBER });
    findMany.mockResolvedValue([]);
    const { requirePermissionResponse } = await load();
    const gate = await requirePermissionResponse("po.upload");
    expect("response" in gate && gate.response.status).toBe(403);
  });

  it("answers 401 for a guest", async () => {
    requireUser.mockRejectedValue(new Error("You are not signed in."));
    const { requirePermissionResponse } = await load();
    const gate = await requirePermissionResponse("po.upload");
    expect("response" in gate && gate.response.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run the suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all green. `tsc` is the thing that finds a call site missed in Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/actions src/app/api src/lib/permissions
git commit -m "feat(rbac): gate catalogue, buyer, user and settings actions; 403 on the API"
```

---

### Task 8: `updatePermissions`

**Files:**
- Create: `src/actions/permissions.ts`, `src/lib/queries/permissions.ts`
- Test: `src/actions/permissions.test.ts`

**Interfaces:**
- Consumes: `requirePermission`, `isPermissionKey`, `OPS_ROLES`, `permissionAction`.
- Produces:
  - `updatePermissions(changes: PermissionChange[]): Promise<ActionResult<{ changed: number }>>` where `PermissionChange = { role: OpsRole; action: PermissionKey; granted: boolean }`
  - `loadPermissionMatrix(): Promise<Record<string, boolean>>` keyed `` `${role}|${action}` ``

- [ ] **Step 1: Write the failing test**

`src/actions/permissions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@/generated/prisma/enums";

const upsert = vi.fn();
const auditCreate = vi.fn();
const tx = { permissionGrant: { upsert }, auditEvent: { create: auditCreate } };
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (c: typeof tx) => unknown) => fn(tx) },
}));
const requirePermission = vi.fn();
vi.mock("@/lib/permissions/require", () => ({
  requirePermission: (key: string) => requirePermission(key),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  upsert.mockReset().mockResolvedValue({});
  auditCreate.mockReset().mockResolvedValue({});
  requirePermission.mockReset().mockResolvedValue({ id: "admin1", role: Role.SUPER_ADMIN });
});

const load = () => import("@/actions/permissions");

it("writes each change and one audit row", async () => {
  const { updatePermissions } = await load();
  const result = await updatePermissions([
    { role: Role.QC, action: "po.upload", granted: false },
    { role: Role.WAREHOUSE, action: "po.edit", granted: true },
  ]);
  expect(result).toEqual({ success: true, data: { changed: 2 } });
  expect(upsert).toHaveBeenCalledTimes(2);
  expect(auditCreate).toHaveBeenCalledTimes(1);
  expect(auditCreate.mock.calls[0][0].data.action).toBe("PERMISSIONS_CHANGED");
  expect(auditCreate.mock.calls[0][0].data.actorId).toBe("admin1");
});

it("refuses a change to the super admin column", async () => {
  const { updatePermissions } = await load();
  const result = await updatePermissions([
    { role: Role.SUPER_ADMIN, action: "po.delete", granted: false },
  ]);
  expect(result).toEqual({
    success: false,
    error: "A super admin's permissions can't be changed.",
  });
  expect(upsert).not.toHaveBeenCalled();
});

it("refuses a locked row", async () => {
  const { updatePermissions } = await load();
  const result = await updatePermissions([
    { role: Role.QC, action: "user.manage", granted: true },
  ]);
  expect(result).toEqual({
    success: false,
    error: "Manage users can't be changed. Everything under Admin is super admin only.",
  });
  expect(upsert).not.toHaveBeenCalled();
});

it("refuses an action key that is not in the registry", async () => {
  const { updatePermissions } = await load();
  const result = await updatePermissions([
    { role: Role.QC, action: "po.edti" as never, granted: true },
  ]);
  expect(result.success).toBe(false);
  expect(upsert).not.toHaveBeenCalled();
});

it("refuses a caller without permission.manage", async () => {
  requirePermission.mockRejectedValue(new Error("nope"));
  const { updatePermissions } = await load();
  const result = await updatePermissions([
    { role: Role.QC, action: "po.upload", granted: false },
  ]);
  expect(result.success).toBe(false);
  expect(upsert).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/actions/permissions.test.ts`
Expected: FAIL — cannot resolve `@/actions/permissions`.

- [ ] **Step 3: Write the query module**

`src/lib/queries/permissions.ts`:

```ts
import { prisma } from "@/lib/prisma";
import { PERMISSION_ACTIONS } from "@/lib/permissions/actions";
import { OPS_ROLES } from "@/lib/permissions/roles";
import { defaultGranted } from "@/lib/permissions/defaults";

export const cellKey = (role: string, action: string) => `${role}|${action}`;

/**
 * Every cell the grid draws, keyed `role|action`.
 *
 * A registry key with no stored row falls back to its default rather than
 * rendering blank, so a permission added by a later phase shows its intended
 * value before anyone has saved the grid.
 */
export async function loadPermissionMatrix(): Promise<Record<string, boolean>> {
  const rows = await prisma.permissionGrant.findMany({
    select: { role: true, action: true, granted: true },
  });
  const stored = new Map(rows.map((r) => [cellKey(r.role, r.action), r.granted]));

  const matrix: Record<string, boolean> = {};
  for (const role of OPS_ROLES) {
    for (const action of PERMISSION_ACTIONS) {
      const key = cellKey(role, action.key);
      matrix[key] = stored.get(key) ?? defaultGranted(role, action.key);
    }
  }
  return matrix;
}
```

- [ ] **Step 4: Write the action**

`src/actions/permissions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuditAction, Role } from "@/generated/prisma/enums";
import { UnauthorizedError } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions/require";
import { isPermissionKey, permissionAction } from "@/lib/permissions/actions";
import { OPS_ROLES } from "@/lib/permissions/roles";
import type { ActionResult } from "@/actions/stages";

const changeSchema = z.object({
  role: z.enum(OPS_ROLES),
  action: z.string().refine(isPermissionKey, "That permission does not exist."),
  granted: z.boolean(),
});

const changesSchema = z.array(changeSchema).min(1).max(200);

export type PermissionChange = z.infer<typeof changeSchema>;

/**
 * The only writer of `PermissionGrant`.
 *
 * It refuses the super admin column and the locked Administration rows. The
 * runtime does not depend on either refusal — `roleCan` short-circuits a super
 * admin without reading the table — but a grid that accepted a change it then
 * ignored would be worse than one that says no.
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
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
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
          where: { role_action: { role: change.role, action: change.action } },
          create: {
            role: change.role,
            action: change.action,
            granted: change.granted,
            updatedById: actorId,
          },
          update: { granted: change.granted, updatedById: actorId },
        });
      }
      // Keys and booleans only — the audit trail never carries a user's data.
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
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/actions/permissions.test.ts`
Expected: PASS.

- [ ] **Step 6: Watch the super-admin refusal fail**

Comment out the `change.role === Role.SUPER_ADMIN` block.

Run: `npx vitest run src/actions/permissions.test.ts -t "super admin column"`
Expected: **FAIL** — it writes. Restore and re-run: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/actions/permissions.ts src/actions/permissions.test.ts src/lib/queries/permissions.ts
git commit -m "feat(rbac): updatePermissions, with the super admin column and admin rows refused"
```

---

### Task 9: Five roles on the users screen

**Files:**
- Modify: `src/lib/validation/users.ts`, `src/lib/queries/users.ts`, `src/components/admin/UsersTable.tsx`, `src/components/admin/UserDrawer.tsx`, `src/components/admin/PendingRequests.tsx`, `src/actions/users.ts`
- Test: `src/lib/validation/users.test.ts`, `src/actions/users.test.ts`

**Interfaces:**
- Consumes: `OPS_ROLES`, `roleLabel`.
- Produces: `userRoleSchema` accepting five roles; `StaffRole` widened; the roster, drawer and approval picker offering five.

- [ ] **Step 1: Write the failing tests**

`src/lib/validation/users.test.ts`, appended:

```ts
import { OPS_ROLES } from "@/lib/permissions/roles";

describe("userRoleSchema", () => {
  it("accepts every ops role", () => {
    for (const role of OPS_ROLES) {
      expect(userRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("still refuses CLIENT", () => {
    expect(userRoleSchema.safeParse(Role.CLIENT).success).toBe(false);
  });
});
```

`src/actions/users.test.ts`, appended:

```ts
it("refuses to demote the last super admin to warehouse", async () => {
  userFindUnique.mockResolvedValue({ id: "u1", role: Role.SUPER_ADMIN, disabledAt: null });
  userCount.mockResolvedValue(0); // no other active super admin
  const { updateUser } = await import("@/actions/users");
  const result = await updateUser("u1", {
    name: "A", email: "a@example.com", role: Role.WAREHOUSE, active: true,
  });
  expect(result).toEqual({
    success: false,
    error: "This is the last super admin. Promote someone else first.",
  });
  expect(userUpdate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/lib/validation/users.test.ts src/actions/users.test.ts`
Expected: FAIL on the new role cases.

- [ ] **Step 3: Widen the schema**

In `src/lib/validation/users.ts`, replace:

```ts
export const userRoleSchema = z.enum([Role.MEMBER, Role.SUPER_ADMIN]);
```

with:

```ts
/**
 * Portal roles only. CLIENT is deliberately absent: the admin drawer must not
 * be able to mint a customer contact or promote one to staff, and a client is
 * created from the buyer's page with a buyer attached (Phase 15).
 *
 * Phase 48 widened this from two to five. `OPS_ROLES` is the one list.
 */
export const userRoleSchema = z.enum(OPS_ROLES);
```

with `import { OPS_ROLES } from "@/lib/permissions/roles";` added.

- [ ] **Step 4: Widen the roster query**

In `src/lib/queries/users.ts`, replace `where: { role: { in: [Role.SUPER_ADMIN, Role.MEMBER] } }` with `where: { role: { in: [...OPS_ROLES] } }`, importing `OPS_ROLES`. Keep the existing comment and add: "Phase 48: the list is `OPS_ROLES`, so a new role cannot be invisible here."

- [ ] **Step 5: Show the role everywhere through one helper**

In `src/components/admin/UsersTable.tsx`, replace the Role cell's
`row.role === "SUPER_ADMIN" ? "Super admin" : "Member"` with `roleLabel(row.role)`.

In `src/components/admin/UserDrawer.tsx`, replace the two hardcoded `<option>`s:

```tsx
              {OPS_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
```

and the form's initial `role: user?.role ?? Role.MEMBER` stays — Member is the right default for a new user, being the view-only role.

In `src/components/admin/PendingRequests.tsx`, the approve control's role picker gets the same `OPS_ROLES.map(...)` treatment, defaulting to `Role.MEMBER`.

Add `import { OPS_ROLES, roleLabel } from "@/lib/permissions/roles";` to each.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/validation/users.test.ts src/actions/users.test.ts && npx tsc --noEmit`
Expected: PASS. `tsc` catches any `StaffRole` narrowing that assumed two values.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validation/users.ts src/lib/queries/users.ts src/components/admin src/lib/validation/users.test.ts src/actions/users.test.ts
git commit -m "feat(rbac): offer all five ops roles on the users screen"
```

---

### Task 10: The permission grid

**Files:**
- Create: `src/components/admin/PermissionGrid.tsx`
- Modify: `src/app/(admin)/admin/page.tsx`

**Interfaces:**
- Consumes: `loadPermissionMatrix`, `cellKey`, `PERMISSION_ACTIONS`, `PERMISSION_GROUPS`, `OPS_ROLES`, `roleLabel`, `updatePermissions`.
- Produces: the grid section on `/admin`.

- [ ] **Step 1: Read the design system**

Read `context/design-system.md` and `docs/specs/00-master.md` §4 before writing any markup. Tokens only — `bg-ink`, `text-body-md`, `rounded-pill`, `p-md`, `text-ink-tertiary`, `border-hairline-strong`. No hex, no px, no arbitrary values.

- [ ] **Step 2: Write the component**

`src/components/admin/PermissionGrid.tsx`, a client component.

Structure:
- `useState<Record<string, boolean>>` seeded from the `matrix` prop; a `dirty` set derived by comparing against the prop.
- Desktop (`hidden md:block`): one `<table>`. First column is the action's `label` with its `description` beneath in `text-ink-tertiary text-body-sm`. One column per `OPS_ROLES` entry, headed `roleLabel(role)`. Rows grouped by `PERMISSION_GROUPS` with a group heading row.
- Each cell is a `<input type="checkbox">` with an `aria-label` of `` `${roleLabel(role)}: ${action.label}` ``. `disabled` when `role === Role.SUPER_ADMIN || action.locked`.
- Locked rows carry a lock glyph beside the label and a `title` reading "Everything under Admin is super admin only."
- Below `md`: a `SegmentGroup` of the five roles (`useState` for the selected one) and the twenty actions as a stacked list of label + description + a 44px checkbox.
- Footer: `<Button pending={saving} disabled={dirty.size === 0}>` reading `Save N changes` / `Save changes`, plus a plain "Discard" that resets to the prop. On save, call `updatePermissions([...dirty].map(...))`, `toast.success("Permissions updated")` or `toast.error(result.error)`, and reset the baseline on success.
- Wrap the action in `try/catch` and reset `saving` in `finally` — the 2026-09-08 defect where an unreachable server left a button disabled for ever.

- [ ] **Step 3: Wire it into the page**

In `src/app/(admin)/admin/page.tsx`, add `loadPermissionMatrix()` to the existing `Promise.all`, and render below `<UsersTable>`:

```tsx
      <PermissionGrid matrix={matrix} />
```

with the imports. `ContactDetailsCard` stays last.

- [ ] **Step 4: Drive it in a browser**

Start the dev server (`npm run dev`) and sign in as a super admin. If `aisha@lovinghandsportal.com` is not `SUPER_ADMIN` on this database, promote her for the pass and **read the role back** afterwards when restoring, per house convention.

Check, and record the figures:
1. The grid renders 20 rows in 6 groups with 5 columns.
2. Every `SUPER_ADMIN` checkbox is checked and disabled.
3. The three Administration rows are disabled across the board.
4. Toggling a cell enables Save and the count reads the number of toggles.
5. Saving toasts, and `prisma.permissionGrant.findUnique` reads the new value back.
6. Discard restores without a save.

- [ ] **Step 5: Measure the sweep**

At 390, 768 and 1440: `document.documentElement.scrollWidth === window.innerWidth` on `/admin`. At 390 the grid must be in role-picker mode and every checkbox ≥ 44px.

- [ ] **Step 6: Restore the database**

Set every cell this step changed back to its default, by id, and confirm `permissionGrant.count()` is 100 and the matrix matches `defaultRows()` again using the Task 3 Step 4 script.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/PermissionGrid.tsx "src/app/(admin)/admin/page.tsx"
git commit -m "feat(rbac): the permission grid on the user-management page"
```

---

### Task 11: The portal UI

**Files:**
- Modify: `src/components/purchase-orders/LifecycleActions.tsx`, `src/app/(portal)/purchase-orders/[id]/page.tsx`, `src/app/(portal)/purchase-orders/page.tsx`, `src/app/(portal)/web-orders/[id]/page.tsx`, `src/app/(portal)/review/[id]/page.tsx`, `src/app/(portal)/upload/page.tsx`, `src/app/(portal)/products/**`, `src/app/(portal)/buyers/**`

**Interfaces:**
- Consumes: `can`, `rolesWithPermission`, `advanceKeyFor`, `roleLabel`.
- Produces: `LifecycleActions` taking `canAdvance: boolean` and `advanceBlockedReason: string | null`.

- [ ] **Step 1: Widen `LifecycleActions`**

Replace the props type:

```tsx
export function LifecycleActions({
  poId,
  next,
  previous,
  canAdvance,
  advanceBlockedReason,
  canMoveBack,
}: {
  poId: string;
  next: PoStage | null;
  previous: PoStage | null;
  canAdvance: boolean;
  /** Who does advance this stage, when the viewer does not. */
  advanceBlockedReason: string | null;
  canMoveBack: boolean;
})
```

The Advance button renders whenever `next` is non-null. When `!canAdvance` it is `disabled` and the caption beneath reads `advanceBlockedReason`. Disabled rather than hidden, deliberately: the same button was there yesterday on a different order, and a missing one reads as a broken page.

`showMoveBack` is unchanged (`canMoveBack && previous !== null`), and the existing caption keeps its wording.

- [ ] **Step 2: Compute the props on the PO detail page**

In `src/app/(portal)/purchase-orders/[id]/page.tsx`, replace the `canMoveBack={user?.role === Role.SUPER_ADMIN}` line and add above the return:

```tsx
  const advanceKey = advanceKeyFor(current);
  const canAdvance = advanceKey ? await can(advanceKey) : false;
  const advanceBlockedReason =
    advanceKey && !canAdvance
      ? await (async () => {
          const owners = (await rolesWithPermission(advanceKey)).filter(
            (role) => role !== Role.SUPER_ADMIN,
          );
          return owners.length
            ? `${owners.map(roleLabel).join(" or ")} advances this stage.`
            : "Only a super admin advances this stage.";
        })()
      : null;
```

and pass:

```tsx
    canAdvance={canAdvance}
    advanceBlockedReason={advanceBlockedReason}
    canMoveBack={await can("po.revert")}
```

Gate `<DeletePoDialog>` at :186 on `await can("po.delete")` instead of the role comparison, and the Edit sheet trigger on `await can("po.edit")`.

- [ ] **Step 3: Gate the other screens**

- `/purchase-orders/page.tsx`: the delete column on `await can("po.delete")`; the "Upload PO" button on `await can("po.upload")`.
- `/web-orders/[id]/page.tsx`: Confirm and Decline on `await can("po.confirm")`; when false, render the read-only summary alone.
- `/review/[id]/page.tsx`: `if (!(await can("po.review"))) notFound();` immediately after the existing guard.
- `/upload/page.tsx`: `if (!(await can("po.upload"))) notFound();`.
- Product screens: the `+ New product` link, the edit drawer trigger, and the danger zone on `await can("product.manage")`.
- Buyer screens: `+ New buyer`, the details-card edit and the contacts card's controls on `await can("buyer.manage")`.

- [ ] **Step 4: Run the suite and the build**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean; lint shows the same 2 pre-existing warnings, 0 errors.

**Do not skip `npm run build`.** `tsc` and the tests both passed over a `"use server"` file exporting a non-async constant on 2026-09-18 while every page carrying it answered 500; only the Next compiler says so.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase-orders/LifecycleActions.tsx "src/app/(portal)"
git commit -m "feat(rbac): hide admin actions and disable Advance off-stage, with a reason"
```

---

### Task 12: Drive it as each role, then verify

**Files:**
- Modify: `docs/specs/48-role-based-access.md` (§13), `context/current-feature.md`

- [ ] **Step 1: Create one throwaway user per role**

Write a temporary script under `scripts/` that creates four users — planner, qc, warehouse, member — with known passwords, **collecting their ids as it goes** so cleanup is by id and never by a wildcard.

- [ ] **Step 2: Drive the stage table in a browser**

For each of Planner, QC and Warehouse, sign in and open a purchase order at each of the five advanceable stages. Record for each combination whether Advance was enabled, and the exact reason text when disabled. That is 15 readings, and they must match spec §5 exactly.

Confirm for each role: no Confirm, no Decline, no Edit, no Delete, no Move back, no Upload for Member, no `/admin` (expect **404**, read with `curl -o /dev/null -w '%{http_code}'`).

- [ ] **Step 3: Prove the server refuses, not just the button**

With the Planner signed in, call `advanceStage` against a `QC_PASSED` order directly — not through the button. A crafted Server-Action POST is **not** a valid probe (it answers "Server action not found" for a super admin too, recorded in Phases 40 and 41); use a temporary route handler that imports the action, drive it, then delete the route.

Expected: `{ success: false, error: "Warehouse advances this stage." }` and the order's stage unchanged when read back.

- [ ] **Step 4: Prove a grid edit takes effect with no deploy**

As a super admin, grant `po.advance.qc_passed` to Planner and save. Without restarting the dev server, reload the Planner's order page: Advance is now enabled. Advance it, read the stage back, then revert the grant and the stage.

- [ ] **Step 5: Sweep**

`/admin`, `/purchase-orders`, a PO detail page and `/upload` at 390 / 768 / 1440 — twelve combinations, `scrollWidth === innerWidth` on every one. Every control ≥ 44px at 390 except the already-accepted classes.

- [ ] **Step 6: Clean up, counted both ends**

Delete the four throwaway users **by id**, with their `LoginAttempt` and `AuditEvent` rows. Delete the temporary script and any probe route. Re-read the counts and confirm they match the baseline taken in Step 1: `user.count()`, `permissionGrant.count()` (100), `purchaseOrder.count()` (400), and every stage and `stageChangedAt` restored on any order this task moved.

- [ ] **Step 7: Rewrite §13 with the figures**

Replace `docs/specs/48-role-based-access.md` §13 with what was **measured** — the 15 stage readings, the refusal text, the no-deploy proof, the sweep numbers, the cleanup counts — and a "Not verified" list that says plainly what was not driven (production, the access-request approval path, two people saving the grid at once).

Update `context/current-feature.md`'s Status block from "specced, not yet built" to built, with the same figures.

- [ ] **Step 8: Final verification**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add docs/specs/48-role-based-access.md context/current-feature.md
git commit -m "docs(rbac): record what was measured"
```

---

## Self-Review

**Spec coverage.** §2 roles → Task 1, 9. §3 schema and the two migrations → Task 1, 3. §4 registry → Task 2. §5 defaults → Task 2, 3. §6 enforcement and the call-site table → Tasks 4, 5, 6, 7. §7 the `/admin` rule → Task 2 (`locked`), Task 8 (the refusal). §8 grid → Task 10; users screen → Task 9; PO detail → Task 11; nav unchanged → no task, correctly. §9 narrowing → Task 12's browser drive. §10 testing → each task's own TDD steps plus Task 12. §11 files → the File Structure table. §12 criteria → Task 12 Steps 2–5. No gaps.

**Placeholders.** None. Every code step carries the code; every verification step carries the command and the expected output.

**Type consistency.** `PermissionKey` is produced in Task 2 and consumed in 4–11 under that name. `OpsRole` / `OPS_ROLES` in Task 2, used in 8 and 9. `loadGrants` / `roleCan` / `can` / `requirePermission` / `rolesWithPermission` / `requirePermissionResponse` all defined in Task 4 (the last appended in Task 7 Step 2, flagged there) and used under those names after. `defaultRows()` in Task 2, used in Task 3 twice. `cellKey` / `loadPermissionMatrix` in Task 8, used in Task 10. `advanceKeyFor` in Task 2, used in Tasks 5 and 11. `guardPermission` is defined per action file in Tasks 5, 6 and 7 rather than shared, matching the existing per-file `guard()` pattern. `ActionResult` is imported from `@/actions/stages`, which is where it already lives.
