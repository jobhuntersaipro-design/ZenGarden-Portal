import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, signInSchema } from "@/lib/validation/auth";

describe("passwordSchema", () => {
  it("accepts a password with a letter, a digit and ten characters", () => {
    expect(passwordSchema.safeParse("Password12").success).toBe(true);
  });

  it("rejects anything shorter than ten characters", () => {
    expect(passwordSchema.safeParse("Pass1234").success).toBe(false);
  });

  it("rejects a password with no digit", () => {
    expect(passwordSchema.safeParse("Passwordddd").success).toBe(false);
  });

  it("rejects a password with no letter", () => {
    expect(passwordSchema.safeParse("1234567890").success).toBe(false);
  });

  it("accepts exactly 72 characters", () => {
    expect(passwordSchema.safeParse(`a1${"x".repeat(70)}`).success).toBe(true);
  });

  it("rejects 73 characters", () => {
    expect(passwordSchema.safeParse(`a1${"x".repeat(71)}`).success).toBe(false);
  });

  it("rejects a password that fits in 72 characters but not 72 bytes", () => {
    // bcrypt truncates at the 72nd byte, so this would silently become a
    // different password than the one the user typed.
    expect(passwordSchema.safeParse(`a1${"é".repeat(69)}`).success).toBe(false);
  });

  it("accepts the seeded temporary password", () => {
    expect(passwordSchema.safeParse("Password123!").success).toBe(true);
  });
});

describe("emailSchema", () => {
  it("lower-cases and trims", () => {
    expect(emailSchema.parse("  Aisha@LovingHandsPortal.com ")).toBe(
      "aisha@lovinghandsportal.com",
    );
  });

  it("rejects a non-address", () => {
    expect(emailSchema.safeParse("aisha").success).toBe(false);
  });
});

describe("signInSchema is email + password and stays that way", () => {
  // An absence test, deliberately. `User.username` reads like a login field to
  // whoever meets it next (docs/specs/23-customer-profiles.md §2), and this is
  // the cheapest way to say it is not one.
  it("does not accept a username in place of an email", () => {
    expect(signInSchema.safeParse({ username: "siti", password: "x" }).success).toBe(false);
  });

  it("parses to exactly email and password", () => {
    const parsed = signInSchema.parse({ email: "a@b.com", password: "x" });
    expect(Object.keys(parsed).sort()).toEqual(["email", "password"]);
  });
});
