import { describe, expect, it } from "vitest";
import {
  SHOP_ROUTE_PREFIX,
  shopHref,
  shopPath,
  isShopPrivatePath,
} from "@/lib/shop-routes";

describe("shop routes", () => {
  it("gives the browser an unprefixed path, or a client lands on /shop/shop/…", () => {
    expect(shopHref.cart()).toBe("/cart");
    expect(shopHref.order("o1")).toBe("/orders/o1");
    expect(shopHref.home()).toBe("/");
  });

  it("gives revalidatePath the resolved path, which is where Next keyed it", () => {
    expect(shopPath.cart()).toBe("/shop/cart");
    expect(shopPath.order("o1")).toBe("/shop/orders/o1");
    expect(shopPath.home()).toBe("/shop");
  });

  it("keeps the two in step: every href is its path minus the prefix", () => {
    const pairs = [
      [shopHref.home(), shopPath.home()],
      [shopHref.cart(), shopPath.cart()],
      [shopHref.orders(), shopPath.orders()],
      [shopHref.product("p1"), shopPath.product("p1")],
      [shopHref.order("o1"), shopPath.order("o1")],
    ] as const;
    for (const [href, path] of pairs) {
      expect(path).toBe(href === "/" ? SHOP_ROUTE_PREFIX : `${SHOP_ROUTE_PREFIX}${href}`);
    }
  });
});

describe("shopHref.catalogue", () => {
  it("builds a browser-relative query and drops empty values", () => {
    expect(
      shopHref.catalogue({ category: "Hair care", brand: undefined, page: "2" })
    ).toBe("/products?category=Hair+care&page=2");
    expect(shopHref.catalogue()).toBe("/products");
  });
});

describe("isShopPrivatePath", () => {
  it("matches the path and its children only", () => {
    expect(isShopPrivatePath("/orders")).toBe(true);
    expect(isShopPrivatePath("/orders/abc")).toBe(true);
    expect(isShopPrivatePath("/ordersx")).toBe(false);
    expect(isShopPrivatePath("/products")).toBe(false);
  });
});
