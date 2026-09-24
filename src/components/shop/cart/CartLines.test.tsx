import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CartLine } from "@/lib/queries/cart";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const { CartLines } = await import("@/components/shop/cart/CartLines");

const line: CartLine = {
  productId: "p1",
  sku: "ZEN-FG-0500-STYLE-MY",
  name: "500ML FINE FRAGRANCE SHOWER GEL — Style",
  brand: "Zen Garden",
  variant: "Style",
  market: "Vietnam",
  packSize: 24,
  cartonsPerPallet: null,
  unit: "carton",
  cartons: 2,
  unitPrice: "312.00",
  amount: "624.00",
  pieces: 48,
  imageUrl: null,
  unavailable: false,
};

/**
 * Phase 58 P2: a line read "RM 312.00 per carton · 48 pieces" and then
 * "48 pieces" again under the stepper, a line apart. The stepper's copy moves
 * with the count, so it is the one kept.
 */
describe("CartLines", () => {
  const html = renderToStaticMarkup(
    <CartLines lines={[line]} onSetCartons={async () => ({ success: true })} onRemove={() => {}} />,
  );

  it("prints the pieces once", () => {
    expect(html.match(/48 pieces/g)).toHaveLength(1);
  });

  it("keeps the price per carton", () => {
    expect(html).toContain("RM 312.00 per carton");
  });
});
