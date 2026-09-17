import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ShopProduct, ShopProductGroup } from "@/lib/queries/shop-catalogue";

// The button reaches a server action and the cart's context; the price is
// what is under test, so it is stubbed to nothing.
vi.mock("@/components/shop/AddToCart", () => ({ AddToCart: () => null }));

const { ShopProductCard } = await import("@/components/shop/ShopProductCard");

const variant = (over: Partial<ShopProduct>): ShopProduct => ({
  id: "p1",
  sku: "ZS-SC-2100-CR-ID",
  name: "Zen Garden Shower Cream 2.1L — CARROT",
  familyId: "f1",
  familyName: "Zen Garden Shower Cream 2.1L",
  brand: "Zen Signature",
  variant: "CARROT",
  category: "Shower cream & gel",
  market: "Indonesia",
  packSize: 6,
  cartonsPerPallet: null,
  unit: "carton",
  listPrice: "10.00",
  imageUrl: null,
  ...over,
});

const group = (variants: ShopProduct[]): ShopProductGroup => {
  const prices = variants.map((v) => Number(v.listPrice));
  return {
    key: "f1",
    name: "Zen Garden Shower Cream 2.1L",
    brand: "Zen Signature",
    packSize: 6,
    market: "Indonesia",
    unit: "carton",
    category: "Shower cream & gel",
    variants,
    priceFrom: Math.min(...prices).toFixed(2),
    priceTo: Math.max(...prices).toFixed(2),
  };
};

/**
 * Reported 2026-09-17 as critical: CARROT is RM 10.00 and its siblings RM 5.00,
 * and the card read "from RM 5.00" with CARROT selected — the listing's
 * cheapest price rather than the flavour the buyer had chosen, which is the
 * one Add to cart puts in the cart.
 */
describe("ShopProductCard price", () => {
  const priced = group([
    variant({ id: "carrot", listPrice: "10.00" }),
    variant({ id: "tea", variant: "GREEN TEA", listPrice: "5.00" }),
    variant({ id: "papaya", variant: "PAPAYA", listPrice: "5.00" }),
  ]);

  it("shows the selected flavour's own price when the flavours are priced apart", () => {
    const html = renderToStaticMarkup(<ShopProductCard group={priced} />);
    expect(html).toContain("RM 10.00");
    expect(html).not.toContain("RM 5.00");
    // "from" would claim a range the buyer is not choosing from.
    expect(html).not.toMatch(/>from</);
  });

  it("shows the cheaper flavour's price when that one is selected", () => {
    const cheapFirst = group([...priced.variants].reverse());
    const html = renderToStaticMarkup(<ShopProductCard group={cheapFirst} />);
    expect(html).toContain("RM 5.00");
    expect(html).not.toContain("RM 10.00");
  });
});
