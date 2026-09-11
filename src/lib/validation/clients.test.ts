import { describe, expect, it } from "vitest";
import {
  createCustomerSchema,
  contactPatchSchema,
  inviteContactSchema,
  phoneSchema,
  usernameSchema,
} from "@/lib/validation/clients";

describe("usernameSchema", () => {
  it("lower-cases and trims, so the unique index is enough on its own", () => {
    expect(usernameSchema.parse("  Acme.Ops  ")).toBe("acme.ops");
  });

  it.each(["acme.ops", "a_1", "zen-garden", "a".repeat(32)])("accepts %s", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ["ab", "too short"],
    [".acme", "leading dot"],
    ["acme ops", "a space"],
    ["acme@ops", "an at sign"],
    ["a".repeat(33), "too long"],
  ])("rejects %s (%s)", (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it("turns blank into null, so clearing the field clears the column", () => {
    expect(phoneSchema.parse("   ")).toBeNull();
    expect(phoneSchema.parse(undefined)).toBeNull();
  });

  it("keeps a number as written — we do not parse Malaysian formats", () => {
    expect(phoneSchema.parse(" +60 12-345 6789 ")).toBe("+60 12-345 6789");
  });
});

describe("inviteContactSchema", () => {
  const base = {
    buyerId: "b1",
    name: "Siti",
    email: "Siti@Buyer.com",
    username: "siti",
    phone: null,
  };

  it("normalises the email as well as the username", () => {
    const parsed = inviteContactSchema.parse(base);
    expect(parsed.email).toBe("siti@buyer.com");
    expect(parsed.username).toBe("siti");
  });

  it("requires a username — a contact without one is not creatable", () => {
    const { username, ...rest } = base;
    expect(inviteContactSchema.safeParse(rest).success).toBe(false);
  });
});

describe("contactPatchSchema", () => {
  it("cannot change the email: that is how we identify the account", () => {
    const parsed = contactPatchSchema.parse({
      name: "Siti",
      username: "siti",
      phone: null,
    });
    expect(Object.keys(parsed).sort()).toEqual(["name", "phone", "username"]);
  });
});

describe("createCustomerSchema", () => {
  const company = {
    name: "Acme Industrial Sdn Bhd",
    address: null,
    paymentTerms: null,
    remark: null,
    contactName: null,
    email: null,
    phone: null,
  };

  it("accepts a company with no shop login at all", () => {
    const parsed = createCustomerSchema.parse({ company });
    expect(parsed.contact).toBeUndefined();
    expect(parsed.sendInvite).toBe(true);
  });

  it("lets the company email be blank but not malformed", () => {
    expect(createCustomerSchema.safeParse({ company: { ...company, email: "" } }).success).toBe(true);
    expect(createCustomerSchema.safeParse({ company: { ...company, email: "nope" } }).success).toBe(false);
  });

  it("rejects a contact missing a username", () => {
    const result = createCustomerSchema.safeParse({
      company,
      contact: { name: "Siti", email: "siti@buyer.com", phone: null },
    });
    expect(result.success).toBe(false);
  });

  it("requires a company name", () => {
    expect(createCustomerSchema.safeParse({ company: { ...company, name: "" } }).success).toBe(false);
  });
});
