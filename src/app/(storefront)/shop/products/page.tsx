import type { Metadata } from "next";
import Link from "next/link";
import { ActiveFilters } from "@/components/shop/catalogue/ActiveFilters";
import { FilterBar } from "@/components/shop/catalogue/FilterBar";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { TablePagination } from "@/components/portal/TablePagination";
import { pageRange, type SearchParams } from "@/lib/queries/pagination";
import { listShopProducts } from "@/lib/queries/shop-catalogue";
import { SHOP_PER_PAGE, parseShopQuery, shopQueryHref } from "@/lib/shop-filters";
import { shopHref } from "@/lib/shop-routes";

export const metadata: Metadata = { title: "Products · Loving Hands" };
export const dynamic = "force-dynamic";

/** "48 products · showing 1–24" / "1 product" / "Nothing yet" (§5.3). */
function resultLabel(total: number, from: number, to: number): string {
  if (total === 0) return "Nothing yet";
  if (total === 1) return "1 product";
  return `${total} products · showing ${from}–${to}`;
}

export default async function ShopCataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = parseShopQuery(params);
  const catalogue = await listShopProducts(query);
  const { from, to } = pageRange(query.page, SHOP_PER_PAGE, catalogue.total);
  const heading = query.category ?? "All products";

  // The href *Clear all* and the empty state's "Clear the filters" both go
  // to — every filter dropped, `category` kept. That came from the category
  // nav, not from anything the reader ticked here.
  const clearFiltersHref = shopQueryHref(
    {
      q: undefined,
      category: query.category,
      brands: [],
      packSizes: [],
      markets: [],
      sort: "name",
      page: 1,
    },
    {},
  );

  return (
    <div className="pt-lg pb-section">
      <div className="flex items-center gap-xs text-[length:var(--text-caption)] text-ink-tertiary">
        <Link href={shopHref.home()} className="text-brand-link hover:underline">
          Home
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink">{heading}</span>
      </div>

      <div className="mt-sm flex flex-wrap items-baseline gap-sm">
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
          {heading}
        </h1>
        <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-tertiary">
          {resultLabel(catalogue.total, from, to)}
        </span>
      </div>

      <div className="mt-lg">
        <FilterBar query={query} facets={catalogue.facets} />
        <ActiveFilters query={query} />
      </div>

      <div className="mt-lg">
        {catalogue.total === 0 ? (
          <div className="rounded-lg border border-hairline p-xxl text-center">
            <p className="text-[length:var(--text-body-md)] text-ink-secondary">
              Nothing matches that. Try a different search.
            </p>
            <Link
              href={clearFiltersHref}
              className="mx-auto mt-md flex h-control-lg w-fit items-center rounded-pill border border-hairline-strong px-lg text-[length:var(--text-button-md)] font-semibold text-ink hover:border-ink"
            >
              Clear the filters
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-md md:grid-cols-3 lg:grid-cols-4">
            {catalogue.products.map((product) => (
              <ShopProductCard key={product.id} product={product} />
            ))}
          </ul>
        )}
      </div>

      {catalogue.total > 0 ? (
        <TablePagination
          page={query.page}
          size={SHOP_PER_PAGE}
          total={catalogue.total}
          sizes={[SHOP_PER_PAGE]}
        />
      ) : null}
    </div>
  );
}
