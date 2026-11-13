import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const auditFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    product: { findMany: (...a: unknown[]) => findMany(...a) },
    auditEvent: { findMany: (...a: unknown[]) => auditFindMany(...a) },
  },
}));
vi.mock("@/lib/dates", () => ({ todayISO: () => "2026-10-15" }));

import { loadCertificationOverview, loadProductCerts } from "@/lib/queries/certificates";

const product = (id: string, variant: string, market: string, certs: { type: string; expiresOn: Date }[] = []) => ({
  id,
  sku: id.toUpperCase(),
  name: "Zen Garden Shower Cream 2.1L",
  brand: "Zen Garden",
  variant,
  packSize: 6,
  market,
  active: true,
  familyId: "fam1",
  family: { name: "Zen Garden Shower Cream 2.1L" },
  certificates: certs,
  certOverrides: [],
});

const halal = { type: "HL", expiresOn: new Date("2028-09-30") };

describe("certification is per product, not per flavour", () => {
  beforeEach(() => {
    auditFindMany.mockResolvedValue([
      {
        id: "e1",
        action: "CERT_OVERRIDE_SET",
        detail: { productIds: ["royal", "lavender"], type: "COA", reason: "Not required" },
        at: new Date("2026-10-10"),
        actor: { name: "Aisha Rahman" },
      },
    ]);
    findMany.mockResolvedValue([
      product("royal", "Royal Jelly", "Indonesia", [halal]),
      product("lavender", "Lavender", "Indonesia"),
      product("vn", "Lavender", "Vietnam"),
    ]);
  });

  it("a certificate on one variant covers every variant of the listing", async () => {
    const certs = await loadProductCerts(["lavender", "royal"]);
    expect(certs.get("lavender")?.HL.status).toBe("approved");
    expect(certs.get("royal")?.HL.status).toBe("approved");
  });

  it("does not cross into the same product in another market", async () => {
    const certs = await loadProductCerts(["vn"]);
    expect(certs.get("vn")?.HL.status).toBe("missing");
  });

  it("the overview has one row per listing", async () => {
    const rows = await loadCertificationOverview();
    expect(rows.map((row) => [row.market, row.variants, row.certs.HL.status])).toEqual([
      ["Indonesia", 2, "approved"],
      ["Vietnam", 1, "missing"],
    ]);
  });

  it("a listing's override history is read from the audit log, once per event", async () => {
    const rows = await loadCertificationOverview();
    expect(rows[0].history).toEqual([
      { id: "e1", type: "COA", set: true, reason: "Not required", by: "Aisha Rahman", at: new Date("2026-10-10") },
    ]);
    expect(rows[1].history).toEqual([]);
  });
});
