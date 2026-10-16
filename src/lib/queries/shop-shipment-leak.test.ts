import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Shipping papers are staff only (Phase 63, decision 5). Nothing a buyer's
 * page or route runs may read a shipment, its papers or its activity. A
 * source scan rather than a select pin: these tables must not be reachable at
 * all, not merely narrowed.
 */
const SHOP_SOURCES = [
  "src/app/(storefront)",
  "src/app/api/shop",
  "src/lib/queries/shop-catalogue.ts",
  "src/lib/queries/shop-checkout.ts",
  "src/lib/queries/shop-home.ts",
  "src/lib/queries/web-orders.ts",
  "src/components/shop",
];

const files = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => files(join(path, name)))
    : /\.tsx?$/.test(path) && !path.endsWith(".test.ts")
      ? [path]
      : [];

describe("shop sources", () => {
  it("never touch a shipment, its papers or its activity", () => {
    const offenders = SHOP_SOURCES.flatMap(files).filter((file) =>
      /\bshipment(Document|Event|Order)?\b|queries\/shipments|actions\/shipments/i.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
