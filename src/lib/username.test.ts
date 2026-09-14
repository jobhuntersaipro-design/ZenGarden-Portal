import { describe, expect, it } from "vitest";
import { usernameSchema } from "@/lib/validation/clients";
import { usernameBase, usernameFromEmail } from "@/lib/username";

describe("usernameBase", () => {
  it("takes the local part, lower-cased", () => {
    expect(usernameBase("Siti.Ops@Acme.com")).toBe("siti.ops");
  });

  it("drops characters the handle alphabet refuses", () => {
    expect(usernameBase("raj+orders@acme.com")).toBe("rajorders");
    expect(usernameBase("mei ling@acme.com")).toBe("meiling");
  });

  it("starts with a letter or number, whatever the address started with", () => {
    expect(usernameBase("_.-siti@acme.com")).toBe("siti");
  });

  it("pads a short handle to three characters and falls back to 'user'", () => {
    expect(usernameBase("ab@acme.com")).toBe("ab0");
    expect(usernameBase("+++@acme.com")).toBe("user");
  });

  it("never exceeds 32 characters", () => {
    expect(usernameBase(`${"a".repeat(40)}@acme.com`)).toHaveLength(32);
  });

  it("always produces something usernameSchema accepts", () => {
    for (const email of [
      "siti@acme.com",
      "Raj+Orders@acme.com",
      "x@acme.com",
      "___@acme.com",
      `${"long".repeat(20)}@acme.com`,
      "9lives@acme.com",
    ]) {
      expect(usernameSchema.safeParse(usernameBase(email)).success).toBe(true);
    }
  });
});

describe("usernameFromEmail", () => {
  it("returns the base when it is free", () => {
    expect(usernameFromEmail("siti@acme.com", [])).toBe("siti");
  });

  it("suffixes -2, -3… past the handles already taken", () => {
    expect(usernameFromEmail("siti@acme.com", ["siti"])).toBe("siti-2");
    expect(usernameFromEmail("siti@acme.com", ["siti", "siti-2"])).toBe("siti-3");
  });

  it("compares case-insensitively, the way the unique index sees it", () => {
    expect(usernameFromEmail("siti@acme.com", ["SITI"])).toBe("siti-2");
  });

  it("keeps a suffixed long handle within 32 characters", () => {
    const base = usernameBase(`${"a".repeat(40)}@acme.com`);
    const next = usernameFromEmail(`${"a".repeat(40)}@acme.com`, [base]);
    expect(next).toHaveLength(32);
    expect(next.endsWith("-2")).toBe(true);
    expect(usernameSchema.safeParse(next).success).toBe(true);
  });
});
