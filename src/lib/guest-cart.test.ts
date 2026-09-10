import { describe, expect, it } from "vitest";
import { MAX_CARTONS_PER_LINE } from "@/lib/validation/cart";
import {
  EMPTY_GUEST_CART,
  MAX_GUEST_LINES,
  addLine,
  guestCartonCount,
  guestCountOf,
  parseGuestCart,
  removeLine,
  setLine,
} from "@/lib/guest-cart";

describe("parseGuestCart", () => {
  it("parses nothing, junk and a wrong version as empty", () => {
    expect(parseGuestCart(null).lines).toEqual([]);
    expect(parseGuestCart("{not json").lines).toEqual([]);
    expect(
      parseGuestCart(
        JSON.stringify({ v: 2, lines: [{ productId: "a", cartons: 1 }] }),
      ).lines,
    ).toEqual([]);
  });

  it("clamps cartons, drops bad lines, dedupes ids and caps the line count", () => {
    const raw = JSON.stringify({
      v: 1,
      lines: [
        { productId: "a", cartons: 0 },
        { productId: "a", cartons: 3 },
        { productId: "b", cartons: 99999 },
        { productId: "", cartons: 2 },
        { productId: 7, cartons: 1 },
      ],
      updatedAt: "",
    });
    expect(parseGuestCart(raw).lines).toEqual([
      { productId: "a", cartons: 3 },
      { productId: "b", cartons: MAX_CARTONS_PER_LINE },
    ]);
    const many = {
      v: 1,
      lines: Array.from({ length: 150 }, (_, i) => ({ productId: `p${i}`, cartons: 1 })),
      updatedAt: "",
    };
    expect(parseGuestCart(JSON.stringify(many)).lines).toHaveLength(MAX_GUEST_LINES);
  });
});

describe("add / set / remove", () => {
  it("add increments, set replaces and removes at zero", () => {
    let cart = addLine(EMPTY_GUEST_CART, "a", 2);
    cart = addLine(cart, "a", 3);
    expect(guestCountOf(cart, "a")).toBe(5);
    cart = setLine(cart, "a", 1);
    expect(guestCountOf(cart, "a")).toBe(1);
    cart = setLine(cart, "a", 0);
    expect(cart.lines).toEqual([]);
  });

  it("add clamps to MAX_CARTONS_PER_LINE", () => {
    const cart = addLine(EMPTY_GUEST_CART, "a", MAX_CARTONS_PER_LINE);
    const next = addLine(cart, "a", 5);
    expect(guestCountOf(next, "a")).toBe(MAX_CARTONS_PER_LINE);
  });

  it("removeLine drops the line", () => {
    const cart = addLine(EMPTY_GUEST_CART, "a", 1);
    expect(removeLine(cart, "a").lines).toEqual([]);
  });

  it("stamps updatedAt on every mutation", () => {
    const cart = addLine(EMPTY_GUEST_CART, "a", 1);
    expect(cart.updatedAt).not.toBe("");
    expect(() => new Date(cart.updatedAt).toISOString()).not.toThrow();
  });
});

describe("guestCartonCount", () => {
  it("sums cartons across lines", () => {
    let cart = addLine(EMPTY_GUEST_CART, "a", 2);
    cart = addLine(cart, "b", 3);
    expect(guestCartonCount(cart)).toBe(5);
  });

  it("is zero for an empty cart", () => {
    expect(guestCartonCount(EMPTY_GUEST_CART)).toBe(0);
  });
});

describe("guestCountOf", () => {
  it("is zero for a product not in the cart", () => {
    expect(guestCountOf(EMPTY_GUEST_CART, "nope")).toBe(0);
  });
});
