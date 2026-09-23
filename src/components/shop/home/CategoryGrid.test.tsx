import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import type { ShopHomeCategory } from "@/lib/queries/shop-home";

const { CategoryGrid } = await import("@/components/shop/home/CategoryGrid");
const { categoryMarkId } = await import("@/components/shop/home/CategoryMark");

const category = (over: Partial<ShopHomeCategory>): ShopHomeCategory => ({
  name: "Shower cream & gel",
  count: 1,
  imageUrl: null,
  ...over,
});

/**
 * The defect this replaced: the tile printed the first two letters of a
 * category's first word, so three seeded categories rendered the same `HA`
 * and production drew two identical tiles side by side.
 */
describe("category marks are identifiers", () => {
  it("tells the three categories apart that all reduced to HA", () => {
    const marks = ["Hand wash & soap", "Hair care", "Hand sanitizer"].map(categoryMarkId);
    expect(new Set(marks).size).toBe(3);
  });

  it("tells production's own colliding labels apart", () => {
    expect(categoryMarkId("Hair & body care")).not.toBe(categoryMarkId("Hand wash & soap"));
  });

  it("reads a label carrying two keywords as its leading one", () => {
    // "Hair & body care" holds `hair` and `body`; it is hair care.
    expect(categoryMarkId("Hair & body care")).toBe("hair");
    // "Hand sanitizer" holds `hand`; it is not a hand wash.
    expect(categoryMarkId("Hand sanitizer")).toBe("sanitizer");
  });

  it("gives every seeded category a mark, and no two of a different kind share one", () => {
    const seeded = PRODUCT_CATEGORIES.filter((name) => name !== "Uncategorised");
    const marks = seeded.map(categoryMarkId);
    expect(marks).not.toContain("generic");
    expect(new Set(marks).size).toBe(seeded.length);
  });

  it("falls back to the generic mark for a label nobody has seen", () => {
    // A category is a growing CatalogLabel, so this is the normal case for
    // anything added after today, not an error.
    expect(categoryMarkId("Pet care")).toBe("generic");
    expect(categoryMarkId("Uncategorised")).toBe("generic");
  });
});

describe("CategoryGrid", () => {
  it("draws a mark where the category has no photograph", () => {
    const html = renderToStaticMarkup(
      <CategoryGrid categories={[category({ name: "Hand wash & soap" })]} />,
    );
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("shows the category's own product photo when there is one", () => {
    const html = renderToStaticMarkup(
      <CategoryGrid
        categories={[category({ name: "Hair care", imageUrl: "https://r2.example/hair" })]}
      />,
    );
    expect(html).toContain('src="https://r2.example/hair"');
  });

  it("names the category and counts it, singular and plural", () => {
    const html = renderToStaticMarkup(
      <CategoryGrid
        categories={[
          category({ name: "Fragrance", count: 1 }),
          category({ name: "Hand wash & soap", count: 2 }),
        ]}
      />,
    );
    expect(html).toContain("Fragrance");
    expect(html).toContain("1 product<");
    expect(html).toContain("2 products<");
  });

  it("links each tile to its own filtered catalogue", () => {
    const html = renderToStaticMarkup(
      <CategoryGrid categories={[category({ name: "Hand wash & soap" })]} />,
    );
    expect(html).toContain("category=Hand+wash+%26+soap");
  });

  it("renders nothing at all when the shop has no categories", () => {
    expect(renderToStaticMarkup(<CategoryGrid categories={[]} />)).toBe("");
  });
});
