import { describe, expect, it } from "vitest";
import { allGreen, certIssues, expiryStatus, productCerts, typeStatus } from "./certification";

const TODAY = "2026-10-14";

describe("expiryStatus", () => {
  it("is green beyond three months, yellow within, red once past", () => {
    expect(expiryStatus("2027-01-15", TODAY)).toBe("approved");
    expect(expiryStatus("2027-01-14", TODAY)).toBe("renew");
    expect(expiryStatus("2026-10-14", TODAY)).toBe("renew");
    expect(expiryStatus("2026-10-13", TODAY)).toBe("expired");
  });
});

describe("typeStatus", () => {
  it("reads missing as its own red state, and the latest certificate decides", () => {
    expect(typeStatus([], false, TODAY).status).toBe("missing");
    expect(typeStatus(["2025-01-01", "2028-01-01"], false, TODAY)).toEqual({
      status: "approved",
      expiresOn: "2028-01-01",
      overridden: false,
    });
  });

  it("an override reads green, even with nothing uploaded", () => {
    expect(typeStatus([], true, TODAY)).toEqual({
      status: "approved",
      expiresOn: null,
      overridden: true,
    });
  });
});

describe("allGreen", () => {
  it("needs all three types green", () => {
    const green = { type: "NOT" as const, expiresOn: "2028-01-01" };
    const certs = [green, { ...green, type: "HL" as const }];
    expect(allGreen(productCerts(certs, [], TODAY))).toBe(false);
    expect(allGreen(productCerts([...certs, { ...green, type: "COA" as const }], [], TODAY))).toBe(true);
    expect(allGreen(productCerts(certs, ["COA"], TODAY))).toBe(true);
  });
});

describe("certIssues", () => {
  const today = "2026-11-13";
  const green = productCerts(
    (["NOT", "HL", "COA"] as const).map((type) => ({ type, expiresOn: "2028-01-01" })),
    [],
    today,
  );
  const renewCoa = productCerts(
    [
      { type: "NOT", expiresOn: "2028-01-01" },
      { type: "HL", expiresOn: "2028-01-01" },
      { type: "COA", expiresOn: "2026-12-01" },
    ],
    [],
    today,
  );
  it("names each non-green product once with the types that are not green", () => {
    const certs = new Map([
      ["a", green],
      ["b", renewCoa],
    ]);
    const lines = [
      { productId: "a", name: "Lime" },
      { productId: "b", name: "Lemon" },
      { productId: "b", name: "Lemon" },
      { productId: "c", name: "Mint" },
    ];
    expect(certIssues(lines, certs)).toEqual([
      "Lemon: COA Renew",
      "Mint: NOT Not uploaded, HL Not uploaded, COA Not uploaded",
    ]);
  });
  it("is empty when every product is green", () => {
    expect(certIssues([{ productId: "a", name: "Lime" }], new Map([["a", green]]))).toEqual([]);
  });
});
