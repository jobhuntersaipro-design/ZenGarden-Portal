import { describe, expect, it } from "vitest";
import { Role } from "@/generated/prisma/enums";
import { OPS_ROLES } from "@/lib/permissions/roles";
import { userRoleSchema } from "@/lib/validation/users";

describe("userRoleSchema", () => {
  it("accepts every ops role", () => {
    for (const role of OPS_ROLES) {
      expect(userRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("accepts the three roles Phase 48 added", () => {
    for (const role of [
      Role.PRODUCTION_PLANNER,
      Role.QC,
      Role.WAREHOUSE,
    ] as const) {
      expect(userRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  /**
   * The schema is what keeps a customer from being promoted to staff from the
   * admin room: a CLIENT has no buyer attached when created there, and the
   * database CHECK would refuse the row anyway.
   */
  it("still refuses CLIENT", () => {
    expect(userRoleSchema.safeParse(Role.CLIENT).success).toBe(false);
  });

  it("refuses a role that does not exist", () => {
    expect(userRoleSchema.safeParse("ADMIN").success).toBe(false);
  });
});
