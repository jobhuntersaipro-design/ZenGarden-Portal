import { describe, expect, it } from "vitest";
import { plural } from "@/lib/plural";

describe("plural (S-20)", () => {
  it("says one of a thing in the singular", () => {
    expect(plural(1, "buyer")).toBe("1 buyer");
  });

  it("says none and many in the plural", () => {
    expect(plural(0, "buyer")).toBe("0 buyers");
    expect(plural(3, "order")).toBe("3 orders");
  });

  it("groups thousands and takes an irregular plural", () => {
    expect(plural(1200, "carton")).toBe("1,200 cartons");
    expect(plural(2, "family", "families")).toBe("2 families");
  });
});
