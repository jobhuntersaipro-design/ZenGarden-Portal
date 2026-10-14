import { describe, expect, it } from "vitest";
import { productCerts } from "@/lib/certification";
import { selectOverview } from "@/lib/certification-overview";
import type { OverviewRow } from "@/lib/queries/certificates";

const TODAY = "2026-10-14";
const row = (name: string, market: string | null, expiresOn: string | null): OverviewRow => ({
  id: name,
  name,
  sku: name.toUpperCase(),
  market,
  overrides: {},
  certs: productCerts(
    expiresOn ? (["NOT", "HL", "COA"] as const).map((type) => ({ type, expiresOn })) : [],
    [],
    TODAY,
  ),
});
const rows = [row("Green", "Malaysia", "2028-01-01"), row("Lapsed", "Indonesia", "2026-01-01"), row("None", null, null)];
const sort = { key: "name", dir: "asc" as const };

describe("selectOverview", () => {
  it("narrows to what needs attention, by market and by search", () => {
    expect(selectOverview(rows, { show: "attention", sort }).map((r) => r.id)).toEqual(["Lapsed", "None"]);
    expect(selectOverview(rows, { show: "all", market: "Malaysia", sort }).map((r) => r.id)).toEqual(["Green"]);
    expect(selectOverview(rows, { show: "all", q: "indo", sort }).map((r) => r.id)).toEqual(["Lapsed"]);
  });

  it("sorts worst first on a status column", () => {
    expect(selectOverview(rows, { show: "all", sort: { key: "HL", dir: "desc" } }).map((r) => r.id)).toEqual([
      "None",
      "Lapsed",
      "Green",
    ]);
  });
});
