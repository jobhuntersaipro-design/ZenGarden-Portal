import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/shop/GuestCartProvider", () => ({ useCartSummary: () => null, useGuestCart: () => ({}) }));
vi.mock("@/components/shop/ShopViewer", () => ({ useShopViewer: () => ({ kind: "client" }) }));

const { hidesCartBar } = await import("@/components/shop/MobileCartBar");

describe("hidesCartBar", () => {
  // The cart and checkout carry their own next step; the bar there said "View
  // cart" to someone already reading it and covered the summary (2026-09-24).
  it.each(["/cart", "/checkout/review", "/checkout/sent/W-2609-00001", "/shop/cart", "/shop/checkout/review"])(
    "steps aside on %s",
    (path) => expect(hidesCartBar(path)).toBe(true),
  );

  it.each(["/", "/products", "/products/p1", "/orders", "/orders/o1", "/shop/products", "/cartons"])(
    "stays on %s",
    (path) => expect(hidesCartBar(path)).toBe(false),
  );
});
