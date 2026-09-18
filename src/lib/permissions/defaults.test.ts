import { describe, expect, it } from "vitest";
import { PoStage, Role } from "@/generated/prisma/enums";
import {
  PERMISSION_ACTIONS,
  advanceKeyFor,
  isPermissionKey,
} from "@/lib/permissions/actions";
import { OPS_ROLES, roleLabel } from "@/lib/permissions/roles";
import { defaultGranted, defaultRows } from "@/lib/permissions/defaults";

describe("the registry", () => {
  // Nineteen since 2026-09-18: `org.settings` went with the supplier record
  // it was the only gate on.
  it("holds nineteen actions with unique keys", () => {
    expect(PERMISSION_ACTIONS).toHaveLength(19);
    const keys = PERMISSION_ACTIONS.map((action) => action.key);
    expect(new Set(keys).size).toBe(19);
  });

  it("gives every action a label and a one-line description", () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.description.length).toBeGreaterThan(0);
      expect(action.description).not.toMatch(/\n/);
      expect(action.description.endsWith(".")).toBe(true);
    }
  });

  // The product never names the model in copy a user reads (2026-09-18).
  it("names no model in any label or description", () => {
    for (const action of PERMISSION_ACTIONS) {
      expect(`${action.label} ${action.description}`).not.toMatch(/claude/i);
    }
  });

  it("locks exactly the two administration rows", () => {
    const locked = PERMISSION_ACTIONS.filter((action) => action.locked).map(
      (action) => action.key,
    );
    expect(locked).toEqual(["user.manage", "permission.manage"]);
  });

  it("narrows an unknown key", () => {
    expect(isPermissionKey("po.edit")).toBe(true);
    expect(isPermissionKey("po.edti")).toBe(false);
  });

  it("keys an advance on the stage it moves from, and stops at delivered", () => {
    expect(advanceKeyFor(PoStage.ORDER_PLACED)).toBe("po.advance.order_placed");
    expect(advanceKeyFor(PoStage.IN_PRODUCTION)).toBe("po.advance.in_production");
    expect(advanceKeyFor(PoStage.QC_PASSED)).toBe("po.advance.qc_passed");
    expect(advanceKeyFor(PoStage.IN_WAREHOUSE)).toBe("po.advance.in_warehouse");
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
    expect(roleLabel(Role.QC)).toBe("QC");
    expect(roleLabel(Role.WAREHOUSE)).toBe("Warehouse");
    expect(roleLabel(Role.MEMBER)).toBe("Member");
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
    ["po.advance.order_placed", Role.PRODUCTION_PLANNER, true],
    ["po.advance.order_placed", Role.QC, false],
    ["po.advance.order_placed", Role.WAREHOUSE, false],
    ["po.advance.in_production", Role.PRODUCTION_PLANNER, false],
    ["po.advance.in_production", Role.QC, true],
    ["po.advance.in_production", Role.WAREHOUSE, false],
    ["po.advance.qc_passed", Role.PRODUCTION_PLANNER, false],
    ["po.advance.qc_passed", Role.QC, false],
    ["po.advance.qc_passed", Role.WAREHOUSE, true],
    ["po.advance.in_warehouse", Role.PRODUCTION_PLANNER, false],
    ["po.advance.in_warehouse", Role.QC, false],
    ["po.advance.in_warehouse", Role.WAREHOUSE, true],
    ["po.advance.delivering", Role.PRODUCTION_PLANNER, false],
    ["po.advance.delivering", Role.QC, false],
    ["po.advance.delivering", Role.WAREHOUSE, true],
  ] as const)("%s for %s is %s", (key, role, expected) => {
    expect(defaultGranted(role, key)).toBe(expected);
  });

  it("gives nobody but a super admin move back, confirm, edit, delete or review", () => {
    for (const role of [
      Role.PRODUCTION_PLANNER,
      Role.QC,
      Role.WAREHOUSE,
      Role.MEMBER,
    ] as const) {
      for (const key of [
        "po.revert",
        "po.confirm",
        "po.edit",
        "po.delete",
        "po.review",
        "product.manage",
        "buyer.manage",
        "user.manage",
        "permission.manage",
      ] as const) {
        expect(defaultGranted(role, key)).toBe(false);
      }
    }
  });

  it("lets the four working roles upload and the member only look", () => {
    for (const role of [
      Role.PRODUCTION_PLANNER,
      Role.QC,
      Role.WAREHOUSE,
    ] as const) {
      expect(defaultGranted(role, "po.upload")).toBe(true);
    }
    expect(defaultGranted(Role.MEMBER, "po.upload")).toBe(false);
    for (const key of [
      "dashboard.view",
      "po.view",
      "product.view",
      "buyer.view",
    ] as const) {
      expect(defaultGranted(Role.MEMBER, key)).toBe(true);
    }
  });

  it("gives every role a decision on every action", () => {
    for (const role of OPS_ROLES) {
      for (const action of PERMISSION_ACTIONS) {
        expect(typeof defaultGranted(role, action.key)).toBe("boolean");
      }
    }
    expect(defaultRows()).toHaveLength(OPS_ROLES.length * PERMISSION_ACTIONS.length);
  });
});
