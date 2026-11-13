import { describe, expect, it } from "vitest";
import { flagFor } from "./flags";

describe("flagFor", () => {
  it("reads the market, then the port's country", () => {
    expect(flagFor("Indonesia")?.code).toBe("ID");
    expect(flagFor("malaysia", "KUCHING, SARAWAK")?.code).toBe("MY");
    expect(flagFor("Vietnam")?.code).toBe("VN");
    expect(flagFor(null, "JAKARTA, INDONESIA")?.code).toBe("ID");
    expect(flagFor("Indonesia")?.src).toMatch(/^data:image\/svg\+xml/);
  });
  it("guesses nothing for a retailer or no destination", () => {
    expect(flagFor("Super Indo", "KUCHING, SARAWAK")).toBeNull();
    expect(flagFor(null, null)).toBeNull();
  });
});
