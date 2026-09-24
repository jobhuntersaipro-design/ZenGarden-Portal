import { describe, expect, it } from "vitest";
import {
  createBuyerSchema,
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

describe("createBuyerSchema", () => {
  const input = {
    name: "Acme Industrial Sdn Bhd",
    contact: { name: "Siti", email: "Siti@Acme.com", phone: " +60 12-345 6789 " },
    // Required since 2026-09-24 — see the schema's own note.
    market: "Mydin",
  };

  it("accepts a company and a contact with nothing folded away", () => {
    const parsed = createBuyerSchema.parse(input);
    expect(parsed.address).toBeNull();
    expect(parsed.paymentTerms).toBeNull();
    expect(parsed.remark).toBeNull();
  });

  it("normalises the contact's email and trims the phone", () => {
    const parsed = createBuyerSchema.parse(input);
    expect(parsed.contact.email).toBe("siti@acme.com");
    expect(parsed.contact.phone).toBe("+60 12-345 6789");
  });

  it("does not ask for a username — that is derived from the email", () => {
    expect(createBuyerSchema.parse(input).contact).not.toHaveProperty("username");
  });

  it("requires the contact's name and a real email", () => {
    expect(createBuyerSchema.safeParse({ ...input, contact: { ...input.contact, name: "" } }).success).toBe(false);
    expect(createBuyerSchema.safeParse({ ...input, contact: { ...input.contact, email: "nope" } }).success).toBe(false);
  });

  it("requires a company name", () => {
    expect(createBuyerSchema.safeParse({ ...input, name: "" }).success).toBe(false);
  });

  it("turns a blank folded field into null, so an untouched disclosure writes nothing", () => {
    const parsed = createBuyerSchema.parse({ ...input, address: "  ", remark: "" });
    expect(parsed.address).toBeNull();
    expect(parsed.remark).toBeNull();
  });

  it("requires a market, because a buyer without one can order nothing", () => {
    // Not the same call the patch schema makes: there a blank is allowed, so
    // the buyers already on record can have their other fields saved.
    const missing = createBuyerSchema.safeParse({ ...input, market: undefined });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]?.message).toBe(
      "Choose the market this buyer buys in",
    );
    expect(createBuyerSchema.safeParse({ ...input, market: null }).success).toBe(false);
  });

  it("refuses a market of spaces rather than storing one nothing matches", () => {
    const blank = createBuyerSchema.safeParse({ ...input, market: "   " });
    expect(blank.success).toBe(false);
    expect(blank.error?.issues[0]?.message).toBe("Choose the market this buyer buys in");
  });

  it("trims the market, so it matches the same value on a product exactly", () => {
    expect(createBuyerSchema.parse({ ...input, market: " Vietnam " }).market).toBe(
      "Vietnam",
    );
  });
});
