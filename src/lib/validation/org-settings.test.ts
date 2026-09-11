import { describe, expect, it } from "vitest";
import { supplierPatchSchema } from "@/lib/validation/org-settings";

const blank = {
  supplierName: null,
  supplierEmail: null,
  supplierPhone: null,
  supplierAddress: null,
};

describe("supplierPatchSchema", () => {
  it("accepts an entirely empty patch — clearing every field is legitimate", () => {
    expect(supplierPatchSchema.parse(blank)).toEqual(blank);
  });

  it("turns blank strings into null, so a cleared field falls back to env", () => {
    const parsed = supplierPatchSchema.parse({
      supplierName: "   ",
      supplierEmail: "",
      supplierPhone: "  ",
      supplierAddress: "\n",
    });
    expect(parsed).toEqual(blank);
  });

  it("trims and lower-cases the email", () => {
    const parsed = supplierPatchSchema.parse({ ...blank, supplierEmail: " Hi@Example.COM " });
    expect(parsed.supplierEmail).toBe("hi@example.com");
  });

  it("refuses a malformed email", () => {
    expect(supplierPatchSchema.safeParse({ ...blank, supplierEmail: "nope" }).success).toBe(false);
  });

  it("keeps an address's line breaks — the footer renders them", () => {
    const address = "12 Jalan Satu\nTaman Dua\n47100 Puchong";
    expect(supplierPatchSchema.parse({ ...blank, supplierAddress: address }).supplierAddress).toBe(
      address,
    );
  });

  it.each([
    ["supplierName", 121],
    ["supplierPhone", 33],
    ["supplierAddress", 301],
  ])("refuses an over-long %s", (field, length) => {
    const result = supplierPatchSchema.safeParse({ ...blank, [field]: "a".repeat(length) });
    expect(result.success).toBe(false);
  });
});
