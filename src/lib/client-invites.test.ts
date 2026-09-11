import { describe, expect, it, vi } from "vitest";

// `uniqueMessage` itself touches neither, but importing this module also
// imports `sendInviteEmail`'s dependencies, which parse real environment
// variables at module scope.
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { APP_URL: "https://www.example.com", SHOP_URL: "https://shop.example.com" },
}));
vi.mock("@/emails/TemporaryPassword", () => ({
  TemporaryPassword: () => null,
  temporaryPasswordSubject: () => "Your temporary password",
}));

const { uniqueMessage } = await import("@/lib/client-invites");

describe("uniqueMessage", () => {
  describe("the flat shape Prisma documents (meta.target)", () => {
    it.each([
      [["username"], "That username is taken."],
      [["email"], "That email address is already in use."],
      [["name"], "Another customer already has that name."],
    ])("maps target %s", (target, message) => {
      expect(uniqueMessage({ target })).toBe(message);
    });

    it("reads a constraint-name string too, and username wins over the 'name' it contains", () => {
      expect(uniqueMessage({ target: "User_username_key" })).toBe("That username is taken.");
    });
  });

  // Observed from a real P2002 raised against this schema under Prisma 7's
  // driver adapter, 2026-09-11 — not inferred. `meta.target` is absent
  // entirely on this connector; the field name lives four levels down.
  describe("the nested shape Prisma 7's driver adapter actually emits", () => {
    it.each([
      ["username", "That username is taken."],
      ["email", "That email address is already in use."],
      ["name", "Another customer already has that name."],
    ])("maps driverAdapterError.cause.constraint.fields containing %s", (field, message) => {
      const meta = { driverAdapterError: { cause: { constraint: { fields: [field] } } } };
      expect(uniqueMessage(meta)).toBe(message);
    });

    it("maps a constraint *name* there too, when the driver reports one instead of fields", () => {
      const meta = {
        driverAdapterError: { cause: { constraint: { name: "User_username_key" } } },
      };
      expect(uniqueMessage(meta)).toBe("That username is taken.");
    });

    it("username wins over the 'name' it contains in the nested shape too", () => {
      const meta = {
        driverAdapterError: { cause: { constraint: { fields: ["username"] } } },
      };
      expect(uniqueMessage(meta)).toBe("That username is taken.");
    });
  });

  it("the overlapping User_username_key case resolves the same way from either shape", () => {
    expect(uniqueMessage({ target: "User_username_key" })).toBe("That username is taken.");
    expect(
      uniqueMessage({
        driverAdapterError: { cause: { constraint: { name: "User_username_key" } } },
      }),
    ).toBe("That username is taken.");
  });

  it.each([
    ["undefined meta", undefined],
    ["null meta", null],
    ["an empty object", {}],
    ["a target that is an empty array", { target: [] }],
    ["driverAdapterError with no cause", { driverAdapterError: {} }],
    ["a cause with no constraint", { driverAdapterError: { cause: {} } }],
    ["a constraint with neither fields nor name", { driverAdapterError: { cause: { constraint: {} } } }],
    ["a non-object meta (string)", "not an object"],
    ["a non-object meta (number)", 42],
  ])("falls back to the generic message for %s", (_label, meta) => {
    expect(uniqueMessage(meta)).toBe("Something about that customer is already in use.");
  });
});
