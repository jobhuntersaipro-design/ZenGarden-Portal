import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";

describe("KpiTile (S-18)", () => {
  it("lets a compact money figure step down when its tile is narrow", () => {
    const html = renderToStaticMarkup(
      <KpiTile compact label="Revenue" value={<KpiMoney value={8180490.81} />} caption="" />,
    );
    expect(html).toContain("@container");
    expect(html).toContain("@kpi-money:text-[length:var(--text-heading-md)]");
    // One line: the currency and its figure never part.
    expect(html).toContain("RM 8,180,490.81");
  });

  it("keeps a compact count at its own size", () => {
    const html = renderToStaticMarkup(
      <KpiTile compact label="Products" value={<KpiNumber value={12} />} caption="" />,
    );
    expect(html).not.toContain("@container");
    expect(html).toContain("text-[length:var(--text-heading-md)]");
  });
});
