import { describe, expect, it } from "vitest";
import { phoneToE164 } from "@/lib/phone";

describe("phoneToE164", () => {
  it("reads an international number as written", () => {
    expect(phoneToE164("+60 12-345 6789")).toBe("+60123456789");
    expect(phoneToE164("0065 8123 4567")).toBe("+6581234567");
  });

  it("reads a local number with a trunk zero as Malaysian", () => {
    expect(phoneToE164("012-345 6789")).toBe("+60123456789");
    expect(phoneToE164("011-2345 6789")).toBe("+601123456789");
    expect(phoneToE164("03-1234 5678")).toBe("+60312345678");
  });

  it("opens empty rather than guessing", () => {
    expect(phoneToE164(null)).toBe("");
    expect(phoneToE164("  ")).toBe("");
    expect(phoneToE164("ext 12")).toBe("");
  });
});
