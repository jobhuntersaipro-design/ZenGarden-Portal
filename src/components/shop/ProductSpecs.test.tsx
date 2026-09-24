import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductSpecs } from "@/components/shop/ProductSpecs";
import type { ShopProductDetail } from "@/lib/queries/shop-catalogue";

const product = (over: Partial<ShopProductDetail>) =>
  ({
    sku: "ZEN-FG-0500-STYLE-MY",
    packSize: 24,
    cartonsPerPallet: null,
    unit: "carton",
    brand: "Zen Garden",
    variant: null,
    market: "Vietnam",
    ...over,
  }) as ShopProductDetail;

/** Phase 58 P3 (D1a): a buyer is not shown a row that has no answer. */
describe("ProductSpecs", () => {
  it("leaves out a row with no value", () => {
    const html = renderToStaticMarkup(<ProductSpecs product={product({})} />);
    expect(html).not.toContain("Cartons per pallet");
    expect(html).not.toContain("Variant");
    expect(html).not.toContain("—");
  });

  it("shows the row once it has a value", () => {
    const html = renderToStaticMarkup(<ProductSpecs product={product({ cartonsPerPallet: 60 })} />);
    expect(html).toContain("Cartons per pallet");
    expect(html).toContain(">60<");
  });

  it("always shows the unit and the product code", () => {
    const html = renderToStaticMarkup(<ProductSpecs product={product({})} />);
    expect(html).toContain("Carton");
    expect(html).toContain("ZEN-FG-0500-STYLE-MY");
  });
});
