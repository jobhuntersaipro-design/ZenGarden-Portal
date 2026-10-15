import { describe, expect, it } from "vitest";
import { productCerts } from "@/lib/certification";
import { matchesExpiry, selectCertificates, selectOverview } from "@/lib/certification-overview";
import type { CertificateRow, OverviewRow } from "@/lib/queries/certificates";

const TODAY = "2026-10-14";
const row = (name: string, market: string | null, expiresOn: string | null): OverviewRow => ({
  id: name,
  name,
  sku: name.toUpperCase(),
  variants: 1,
  market,
  overrides: {},
  certs: productCerts(
    expiresOn ? (["NOT", "HL", "COA"] as const).map((type) => ({ type, expiresOn })) : [],
    [],
    TODAY,
  ),
});
const rows = [
  row("Green", "Malaysia", "2028-01-01"),
  row("Lapsed", "Indonesia", "2026-01-01"),
  row("None", null, null),
  row("Soon", "Malaysia", "2026-11-01"),
];
const sort = { key: "name", dir: "asc" as const };

describe("selectOverview", () => {
  it("narrows to what needs attention, by market and by search", () => {
    expect(selectOverview(rows, { show: "attention", sort, today: TODAY }).map((r) => r.id)).toEqual(["Lapsed", "None", "Soon"]);
    expect(selectOverview(rows, { show: "all", market: "Malaysia", sort, today: TODAY }).map((r) => r.id)).toEqual(["Green", "Soon"]);
    expect(selectOverview(rows, { show: "all", q: "indo", sort, today: TODAY }).map((r) => r.id)).toEqual(["Lapsed"]);
  });

  it("sorts worst first on a status column", () => {
    expect(selectOverview(rows, { show: "all", sort: { key: "HL", dir: "desc" }, today: TODAY }).map((r) => r.id)).toEqual([
      "None",
      "Lapsed",
      "Soon",
      "Green",
    ]);
  });
});

describe("expiry filters", () => {
  const ids = (list: { id: string }[]) => list.map((r) => r.id);
  const base = { show: "all" as const, sort, today: TODAY };

  it("draws the windows from today, inclusive at both ends", () => {
    expect(matchesExpiry("2026-10-14", "30", TODAY)).toBe(true);
    expect(matchesExpiry("2026-11-13", "30", TODAY)).toBe(true);
    expect(matchesExpiry("2026-11-14", "30", TODAY)).toBe(false);
    expect(matchesExpiry("2026-10-13", "30", TODAY)).toBe(false);
    expect(matchesExpiry("2026-10-13", "expired", TODAY)).toBe(true);
    expect(matchesExpiry(null, "missing", TODAY)).toBe(true);
    expect(matchesExpiry(null, "expired", TODAY)).toBe(false);
  });

  it("narrows products by type and expiry together", () => {
    expect(ids(selectOverview(rows, { ...base, expiry: "expired" }))).toEqual(["Lapsed"]);
    expect(ids(selectOverview(rows, { ...base, expiry: "30" }))).toEqual(["Soon"]);
    expect(ids(selectOverview(rows, { ...base, expiry: "missing" }))).toEqual(["None"]);
    // A type alone keeps the products that have that certificate.
    expect(ids(selectOverview(rows, { ...base, type: "HL" }))).toEqual(["Green", "Lapsed", "Soon"]);
  });

  it("reads only the chosen type, and an override never reads expired", () => {
    const mixed: OverviewRow = {
      ...row("Mixed", null, null),
      certs: productCerts(
        [
          { type: "HL", expiresOn: "2026-01-01" },
          { type: "NOT", expiresOn: "2028-01-01" },
        ],
        ["HL"],
        TODAY,
      ),
    };
    expect(ids(selectOverview([mixed], { ...base, type: "HL", expiry: "expired" }))).toEqual([]);
    expect(ids(selectOverview([mixed], { ...base, type: "NOT", expiry: "valid" }))).toEqual(["Mixed"]);
    expect(ids(selectOverview([mixed], { ...base, type: "COA", expiry: "missing" }))).toEqual(["Mixed"]);
  });

  it("narrows certificates by type, uploader and expiry", () => {
    const cert = (id: string, type: CertificateRow["type"], by: string | null, expiresOn: string): CertificateRow => ({
      id,
      type,
      originalName: `${id}.pdf`,
      reference: null,
      expiresOn,
      products: [],
      uploadedBy: by,
      createdAt: new Date(),
    });
    const certs = [cert("a", "HL", "Aisha", "2026-01-01"), cert("b", "OTHER", "Chris", "2027-06-01")];
    expect(ids(selectCertificates(certs, { today: TODAY, type: "OTHER" }))).toEqual(["b"]);
    expect(ids(selectCertificates(certs, { today: TODAY, uploadedBy: "Aisha" }))).toEqual(["a"]);
    expect(ids(selectCertificates(certs, { today: TODAY, expiry: "expired" }))).toEqual(["a"]);
    expect(ids(selectCertificates(certs, { today: TODAY, q: "b.pdf" }))).toEqual(["b"]);
  });
});
