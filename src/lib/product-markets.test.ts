import { describe, expect, it } from "vitest";
import {
  MARKET_SORT_KEYS,
  NO_MARKET,
  NO_MARKET_LABEL,
  groupMarkets,
  selectMarkets,
  type MarketRow,
  type MarketSortKey,
} from "@/lib/product-markets";

type Member = {
  id: string;
  market: string | null;
  brand: string | null;
  active: boolean;
  flags: readonly string[];
};

const product = (
  id: string,
  market: string | null,
  extra: Partial<Member> = {},
): Member => ({
  id,
  market,
  brand: "Zen Garden",
  active: true,
  flags: [],
  ...extra,
});

const sale = (
  purchaseOrderId: string,
  buyerId: string,
  quantity: number,
  amount: number,
) => ({ purchaseOrderId, buyerId, quantity, amount });

const sort = (key: MarketSortKey, dir: "asc" | "desc" = "desc") =>
  ({ key, dir }) as const;

const names = (rows: MarketRow[]) => rows.map((row) => row.name);
const byName = (rows: MarketRow[], name: string) =>
  rows.find((row) => row.name === name)!;

describe("grouping the catalogue by market", () => {
  it("is one row per market, counting products, active and to fix", () => {
    const rows = groupMarkets(
      [
        product("a", "Vietnam"),
        product("b", "Vietnam", { active: false, flags: ["inactive"] }),
        product("c", "Vietnam", { flags: ["missing-image", "needs-review"] }),
        product("d", "Mydin"),
      ],
      new Map(),
    );

    expect(rows).toHaveLength(2);
    const vietnam = byName(rows, "Vietnam");
    expect(vietnam.products).toBe(3);
    expect(vietnam.active).toBe(2);
    // A product carrying two flags is still one product to fix, not two.
    expect(vietnam.toFix).toBe(2);
    expect(byName(rows, "Mydin").products).toBe(1);
  });

  it("sums a market's revenue from exactly its own products", () => {
    const rows = groupMarkets(
      [product("a", "Vietnam"), product("b", "Vietnam"), product("c", "Mydin")],
      new Map([
        ["a", [sale("po-1", "buyer-1", 10, 100.5)]],
        ["b", [sale("po-2", "buyer-2", 5, 49.5)]],
        ["c", [sale("po-3", "buyer-3", 1, 999)]],
      ]),
    );

    const vietnam = byName(rows, "Vietnam");
    expect(vietnam.units).toBe(15);
    expect(vietnam.revenue).toBe(150);
    expect(byName(rows, "Mydin").revenue).toBe(999);
  });

  it("counts distinct orders and buyers across the market, not per product", () => {
    // Two of the market's products on one purchase order is one order and one
    // buyer. Summing per product would report 2 and 2 — a market as busy as
    // its products are bought together, which is the failure this guards.
    const rows = groupMarkets(
      [product("a", "Vietnam"), product("b", "Vietnam")],
      new Map([
        ["a", [sale("po-1", "buyer-1", 1, 10)]],
        ["b", [sale("po-1", "buyer-1", 1, 10)]],
      ]),
    );

    const vietnam = byName(rows, "Vietnam");
    expect(vietnam.orders).toBe(1);
    expect(vietnam.buyers).toBe(1);
    expect(vietnam.products).toBe(2);
  });

  it("counts the brands sold into a market, and does not count an absent one", () => {
    const rows = groupMarkets(
      [
        product("a", "Vietnam", { brand: "Zen Garden" }),
        product("b", "Vietnam", { brand: "Zen Garden" }),
        product("c", "Vietnam", { brand: "MR. KING" }),
        // Not in a brand called nothing, so it adds no brand.
        product("d", "Vietnam", { brand: null }),
      ],
      new Map(),
    );

    expect(byName(rows, "Vietnam").brands).toBe(2);
  });

  it("gathers the products carrying no market into one last row", () => {
    const rows = groupMarkets(
      [
        product("a", null, { flags: ["needs-review"] }),
        product("b", null),
        product("c", "Vietnam"),
      ],
      new Map(),
    );

    const remainder = rows.at(-1)!;
    expect(remainder.id).toBe(NO_MARKET);
    expect(remainder.name).toBe(NO_MARKET_LABEL);
    expect(remainder.products).toBe(2);
    // Its real count, not a stand-in label: it is the only figure that says
    // whether the row needs opening.
    expect(remainder.toFix).toBe(1);
  });

  it("rounds revenue to cents, so two sums of the same figures print alike", () => {
    const rows = groupMarkets(
      [product("a", "Vietnam"), product("b", "Vietnam"), product("c", "Vietnam")],
      new Map([
        ["a", [sale("po-1", "buyer-1", 1, 0.1)]],
        ["b", [sale("po-2", "buyer-2", 1, 0.2)]],
        ["c", [sale("po-3", "buyer-3", 1, 0.3)]],
      ]),
    );

    expect(byName(rows, "Vietnam").revenue).toBe(0.6);
  });
});

describe("searching and sorting the market rows", () => {
  const rows = groupMarkets(
    [
      product("a", "Vietnam"),
      product("b", "Vietnam"),
      product("c", "Mydin"),
      product("d", "Super Indo", { flags: ["missing-image"] }),
      product("e", null),
    ],
    new Map([
      ["a", [sale("po-1", "buyer-1", 4, 400)]],
      ["c", [sale("po-2", "buyer-2", 1, 900)]],
      ["d", [sale("po-3", "buyer-3", 2, 100)]],
    ]),
  );

  it("orders on revenue in both directions", () => {
    expect(names(selectMarkets(rows, { sort: sort("revenue", "desc") }))).toEqual([
      "Mydin",
      "Vietnam",
      "Super Indo",
      NO_MARKET_LABEL,
    ]);
    expect(names(selectMarkets(rows, { sort: sort("revenue", "asc") }))).toEqual([
      "Super Indo",
      "Vietnam",
      "Mydin",
      NO_MARKET_LABEL,
    ]);
  });

  it("keeps the remainder row last whichever way it is sorted", () => {
    for (const key of MARKET_SORT_KEYS) {
      for (const dir of ["asc", "desc"] as const) {
        const ordered = selectMarkets(rows, { sort: sort(key, dir) });
        expect(ordered.at(-1)!.id).toBe(NO_MARKET);
      }
    }
  });

  it("sorts the most to fix first", () => {
    expect(selectMarkets(rows, { sort: sort("status", "desc") })[0].name).toBe(
      "Super Indo",
    );
  });

  it("searches the market's name, and finds the remainder row by what it prints", () => {
    expect(names(selectMarkets(rows, { q: "viet", sort: sort("revenue") }))).toEqual([
      "Vietnam",
    ]);
    expect(names(selectMarkets(rows, { q: "no market", sort: sort("revenue") }))).toEqual(
      [NO_MARKET_LABEL],
    );
    expect(selectMarkets(rows, { q: "nothing here", sort: sort("revenue") })).toEqual([]);
  });
});
