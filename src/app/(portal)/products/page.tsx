import type { Metadata } from "next";
import Link from "next/link";
import { can } from "@/lib/permissions/require";
import { PageHeader } from "@/components/portal/PageHeader";
import { TablePagination } from "@/components/portal/TablePagination";
import { KpiMoney, KpiNumber, KpiTile } from "@/components/dashboard/KpiTile";
import { AttentionTile } from "@/components/products/AttentionTile";
import { Button } from "@/components/ui/button";
import { FamiliesList } from "@/components/products/FamiliesList";
import { ProductCard } from "@/components/products/ProductCard";
import { ProductsList } from "@/components/products/ProductsList";
import {
  ProductToolbar,
  type ProductBy,
  type ProductView,
} from "@/components/products/ProductToolbar";
import { formatMYR } from "@/lib/money";
import {
  FAMILY_SORT_KEYS,
  NO_FAMILY,
  selectFamilies,
  type FamilySortKey,
} from "@/lib/product-families";
import { presignGet } from "@/lib/r2";
import {
  PRODUCT_SORT_KEYS,
  listProducts,
  selectProducts,
  summarise,
  type ProductFilter,
  type ProductSortKey,
} from "@/lib/queries/products";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";

export const metadata: Metadata = { title: "Products · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const FILTERS: ProductFilter[] = [
  "needs-review",
  "missing-image",
  "inactive",
  "price-moved",
  "not-sold-60d",
  // A chip added to ProductToolbar and not to this list changes the URL and
  // is then ignored by the page — the Phase 11 defect. The two belong together.
  "low-stock",
];

/** Grid pages differ from the table's, because cards are cheaper to scan. */
const GRID_SIZES = [12, 8, 30, 50] as const;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { products, families } = await listProducts();
  const canManageProducts = await can("product.manage");

  const filterParam = firstParam(params, "filter") as ProductFilter;
  const filter = FILTERS.includes(filterParam) ? filterParam : null;
  const q = firstParam(params, "q")?.trim() || undefined;
  const category = firstParam(params, "category") || undefined;
  const brand = firstParam(params, "brand") || undefined;
  // Rows are products unless asked for families (Phase 36). A `family`
  // narrows the product view to one family's variants — the family row's
  // link — and only means something there.
  const by: ProductBy = firstParam(params, "by") === "family" ? "family" : "product";
  const familyParam = firstParam(params, "family") || undefined;
  const family = by === "product" ? familyParam : undefined;
  const familyRow = family ? families.find((row) => row.id === family) : undefined;
  const sort =
    by === "family"
      ? parseSort(params, FAMILY_SORT_KEYS, { key: "revenue", dir: "desc" })
      : parseSort(params, PRODUCT_SORT_KEYS, { key: "revenue", dir: "desc" });

  // From the rows already fetched, so the filter can never offer a brand that
  // would match nothing.
  const brands = [
    ...new Set(products.map((product) => product.brand).filter(Boolean)),
  ].sort() as string[];

  // Categories the same way, and for the same reason. They were the fixed nine
  // until Phase 27 made the list grow by typing; reading them back from the
  // rows keeps the filter honest in both directions — a category somebody
  // added shows up, and one nothing uses does not.
  const categories = [
    ...new Set(products.map((product) => product.category)),
  ].sort();

  const viewParam = firstParam(params, "view");
  // URL first; the stored preference is applied client-side when absent.
  const view: ProductView = viewParam === "list" ? "list" : "grid";

  const selected = selectProducts(products, {
    q,
    category,
    brand,
    family,
    filter,
    sort: sort as { key: ProductSortKey; dir: "asc" | "desc" },
  });
  const selectedFamilies = selectFamilies(families, {
    q,
    brand,
    category,
    sort: sort as { key: FamilySortKey; dir: "asc" | "desc" },
  });

  // The KPI row describes every product; the footer describes the filter. With
  // nothing applied the two read from the same list and must be identical.
  const all = summarise(products);
  const shown = summarise(selected);
  const shownFamilies = {
    count: selectedFamilies.length,
    revenue:
      Math.round(selectedFamilies.reduce((sum, row) => sum + row.revenue, 0) * 100) / 100,
  };

  // One set of sizes per view, and the footer is told which, so it can never
  // offer "10 per page" beside twelve cards.
  const sizes = view === "grid" && by === "product" ? GRID_SIZES : undefined;
  const { page, size, skip, take } = parsePagination(params, sizes);
  const paged = selected.slice(skip, skip + take);
  const pagedFamilies = selectedFamilies.slice(skip, skip + take);
  const total = by === "family" ? selectedFamilies.length : selected.length;

  const familyChip = family
    ? `${shown.count} ${shown.count === 1 ? "variant" : "variants"} of ${
        family === NO_FAMILY ? "no family" : (familyRow?.code ?? family)
      }`
    : null;

  // Signed server-side and passed as props; a key never reaches the client.
  const imageUrls = new Map<string, string>();
  if (view === "grid" && by === "product") {
    await Promise.all(
      paged.map(async (product) => {
        if (!product.thumbKey) return;
        try {
          imageUrls.set(product.id, await presignGet(product.thumbKey));
        } catch {
          // R2 unreachable: the card falls back to its initials tile.
        }
      }),
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        action={
          canManageProducts ? (
            // A real link, not a drawer trigger: cmd-click, middle-click and
            // "Open in new tab" all work, and the form has a URL to return to.
            <Button asChild>
              <Link href="/products/new">+ New product</Link>
            </Button>
          ) : (
            <span className="rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] text-ink-secondary">
              View only · ask a super admin to change products
            </span>
          )
        }
      />

      <div className="mb-lg grid grid-cols-2 gap-md lg:grid-cols-4">
        <KpiTile
          compact
          label="Products"
          value={<KpiNumber value={all.count} />}
          caption={`${all.activeCount} active · ${all.categories} categories`}
        />
        <KpiTile
          compact
          mobileFull
          label="Revenue · 12 months"
          value={<KpiMoney value={all.revenue} />}
          caption={`${Math.round(all.units).toLocaleString("en-MY")} units sold`}
        />
        <KpiTile
          compact
          label="Best seller"
          value={
            <span
              title={all.best?.name}
              className="block line-clamp-2 text-[length:var(--text-heading-md)] leading-tight"
            >
              {all.best?.name ?? "—"}
            </span>
          }
          caption={
            all.best && all.revenue > 0
              ? `${((all.best.stats.revenue / all.revenue) * 100).toFixed(1)}% of revenue`
              : "No sales in this window"
          }
        />
        <AttentionTile counts={all.attention} />
      </div>

      {/* The shop shows priced, reviewed, active products only, so this is the
          worklist made countable. Rendered only while something is missing:
          once the catalogue is ready it is nothing to report, the same rule
          WorkQueue follows. */}
      {all.shop.visible < all.activeCount ? (
        <section className="mb-lg rounded-md border border-hairline bg-canvas p-md">
          <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            In the shop
          </h2>
          <p className="mt-xxs text-[length:var(--text-body-md)] text-ink">
            <span className="font-semibold tabular-nums">{all.shop.visible}</span>
            {` of ${all.activeCount} products can be ordered on the shop.`}
          </p>
          <ul className="mt-xs flex flex-col gap-xxs text-[length:var(--text-body-sm)] text-ink-secondary">
            {all.shop.unpriced > 0 ? (
              <li>
                <Link
                  href="/products?filter=needs-review"
                  className="text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {`${all.shop.unpriced} need a price`}
                </Link>
              </li>
            ) : null}
            {all.shop.awaitingReview > 0 ? (
              <li>
                <Link
                  href="/products?filter=needs-review"
                  className="text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {`${all.shop.awaitingReview} have a price but are still marked "Needs review" — saving one clears it`}
                </Link>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <ProductToolbar
        view={view}
        by={by}
        familyChip={familyChip}
        filter={filter}
        sortKey={sort.key as ProductSortKey | FamilySortKey}
        summary={
          by === "family"
            ? `${shownFamilies.count} ${shownFamilies.count === 1 ? "family" : "families"} · ${formatMYR(shownFamilies.revenue.toFixed(2))} in 12 months`
            : `${shown.count} ${shown.count === 1 ? "product" : "products"} · ${formatMYR(shown.revenue.toFixed(2))} in 12 months`
        }
        brands={brands}
        categories={categories}
      />

      {by === "family" ? (
        <FamiliesList
          rows={pagedFamilies}
          sort={sort}
          canManage={canManageProducts}
        />
      ) : view === "grid" ? (
        paged.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-canvas p-xl text-center text-[length:var(--text-body-sm)] text-ink-secondary">
            No products match.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-md lg:grid-cols-4">
            {paged.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                imageUrl={imageUrls.get(product.id) ?? null}
              />
            ))}
          </div>
        )
      ) : (
        <ProductsList rows={paged} sort={sort} />
      )}

      <TablePagination page={page} size={size} total={total} sizes={sizes} />
    </>
  );
}
