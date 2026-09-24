import type { Metadata } from "next";
import Link from "next/link";
import { ActiveFilters } from "@/components/shop/catalogue/ActiveFilters";
import { FilterBar } from "@/components/shop/catalogue/FilterBar";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { TablePagination } from "@/components/portal/TablePagination";
import { pageRange, type SearchParams } from "@/lib/queries/pagination";
import { listShopCategories, listShopProducts } from "@/lib/queries/shop-catalogue";
import { catalogueHeading, isNarrowed, resultLabel } from "@/lib/shop-catalogue-labels";
import { SHOP_PER_PAGE, parseShopQuery, shopQueryHref } from "@/lib/shop-filters";
import { shopHref } from "@/lib/shop-routes";
import { NoMarketPanel } from "@/components/shop/NoMarketPanel";
import { loadShopAudience } from "@/lib/shop-viewer";

export const metadata: Metadata = { title: "Products · Zen Garden" };
export const dynamic = "force-dynamic";

export default async function ShopCataloguePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = parseShopQuery(params);

  const audience = await loadShopAudience();
  if (audience.kind === "unassigned") {
    return (
      <div className="pt-xl">
        <NoMarketPanel heading="No products to show you yet" />
      </div>
    );
  }

  const [catalogue, categories] = await Promise.all([
    listShopProducts(query, audience.market),
    listShopCategories(audience.market),
  ]);
  const { from, to } = pageRange(query.page, SHOP_PER_PAGE, catalogue.total);
  // The breadcrumb names where the reader is; the heading names what the
  // grid is showing, which under a search is the search.
  const crumb = query.category ?? "All products";
  const heading = catalogueHeading(query);

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
        <span className="text-ink">{crumb}</span>
      </div>

      <div className="mt-sm flex flex-wrap items-baseline gap-sm">
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
          {heading}
        </h1>
        <span className="tabular-nums text-[length:var(--text-body-sm)] text-ink-tertiary">
          {resultLabel(catalogue.total, from, to, isNarrowed(query))}
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
            {/* Somewhere to go next without retyping (Phase 58). */}
            {categories.length > 0 ? (
              <nav aria-label="Browse a category" className="mt-lg">
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  Or browse a category
                </p>
                <ul className="mt-xs flex flex-wrap justify-center gap-xs">
                  {categories.map((category) => (
                    <li key={category}>
                      <Link
                        href={shopHref.catalogue({ category })}
                        className="flex h-control-md items-center rounded-pill border border-hairline-strong px-md text-[length:var(--text-body-sm)] text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-control-sm"
                      >
                        {category}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-md md:grid-cols-3 lg:grid-cols-4">
            {catalogue.groups.map((group) => (
              <ShopProductCard key={group.key} group={group} />
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
