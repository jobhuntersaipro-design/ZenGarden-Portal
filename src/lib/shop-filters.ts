import { firstParam, type SearchParams } from "@/lib/queries/pagination";

export const SHOP_SORTS = ["name", "price-asc", "price-desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

/** Cards, not table rows — 24 divides evenly into the 4/3/2-up grid. */
export const SHOP_PER_PAGE = 24;

export type ShopCatalogueQuery = {
  q: string | undefined;
  category: string | undefined;
  brands: string[];
  packSizes: number[];
  markets: string[];
  sort: ShopSort;
  page: number;
};

function splitValues(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function splitNumbers(value: string | undefined): number[] {
  return splitValues(value)
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isFinite(n));
}

const isShopSort = (value: string | undefined): value is ShopSort =>
  (SHOP_SORTS as readonly string[]).includes(value ?? "");

/**
 * The URL is the whole of the catalogue's filter state (§5.3) — this is the
 * one place it is read. Every field is defaulted so a page built from it never
 * has to ask "was this actually in the URL?"
 */
export function parseShopQuery(params: SearchParams): ShopCatalogueQuery {
  const q = firstParam(params, "q")?.trim() || undefined;
  const category = firstParam(params, "category")?.trim() || undefined;
  const brands = splitValues(firstParam(params, "brand"));
  const packSizes = splitNumbers(firstParam(params, "pack"));
  const markets = splitValues(firstParam(params, "market"));

  const sortParam = firstParam(params, "sort");
  const sort = isShopSort(sortParam) ? sortParam : "name";

  const rawPage = Number.parseInt(firstParam(params, "page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;

  return { q, category, brands, packSizes, markets, sort, page };
}

/**
 * A new `/products` href with `over` applied on top of `query`. Any key other
 * than `page` resets the page to 1 — a filter, search or sort change looks at
 * a different set of rows, and page 4 of that set is usually empty.
 */
export function shopQueryHref(
  query: ShopCatalogueQuery,
  over: Partial<ShopCatalogueQuery>,
): string {
  const resetsPage = Object.keys(over).some((key) => key !== "page");
  const next: ShopCatalogueQuery = {
    ...query,
    ...over,
    page: resetsPage ? 1 : (over.page ?? query.page),
  };

  const params = new URLSearchParams();
  if (next.category) params.set("category", next.category);
  if (next.brands.length) params.set("brand", next.brands.join(","));
  if (next.packSizes.length) params.set("pack", next.packSizes.join(","));
  if (next.markets.length) params.set("market", next.markets.join(","));
  if (next.q) params.set("q", next.q);
  if (next.sort !== "name") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));

  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}
