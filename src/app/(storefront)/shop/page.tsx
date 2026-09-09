import Link from "next/link";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { TablePagination } from "@/components/portal/TablePagination";
import { ShopHeader } from "@/components/shop/ShopHeader";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { cartCount } from "@/lib/queries/cart";
import { listShopProducts } from "@/lib/queries/shop-catalogue";

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

export default async function ShopCatalogue({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: userId, buyerId } = await requireClient();
  const query = await searchParams;
  const first = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Math.max(1, Number(first("page") ?? 1) || 1);
  const filters = {
    q: first("q"),
    category: first("category"),
    brand: first("brand"),
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
  };

  const [buyer, count, catalogue] = await Promise.all([
    prisma.buyer.findUnique({ where: { id: buyerId }, select: { name: true } }),
    cartCount(userId),
    listShopProducts(filters),
  ]);

  const href = (over: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({
      q: filters.q,
      category: filters.category,
      brand: filters.brand,
      ...over,
    })) {
      if (value) next.set(key, value);
    }
    const search = next.toString();
    return search ? `/?${search}` : "/";
  };

  return (
    <main>
      <ShopHeader buyerName={buyer?.name ?? ""} cartCount={count} />

      <form className="mb-md" action="/">
        <label htmlFor="q" className="sr-only">
          Search the catalogue
        </label>
        <input
          id="q"
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search by name, brand or variant"
          className="h-control-md w-full rounded-sm border border-hairline-strong bg-canvas px-sm text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus"
        />
      </form>

      {catalogue.categories.length > 1 ? (
        <div className="mb-sm">
          <SegmentGroup label="Category" hideLabel>
            <Link
              href={href({ category: undefined, page: undefined })}
              data-active={!filters.category}
              className="min-h-control-md whitespace-nowrap rounded-sm px-sm text-[length:var(--text-body-sm)] text-ink-secondary data-[active=true]:bg-surface-soft data-[active=true]:text-ink sm:min-h-control-sm"
            >
              All
            </Link>
            {catalogue.categories.map((category) => (
              <Link
                key={category}
                href={href({ category, page: undefined })}
                data-active={filters.category === category}
                className="min-h-control-md whitespace-nowrap rounded-sm px-sm text-[length:var(--text-body-sm)] text-ink-secondary data-[active=true]:bg-surface-soft data-[active=true]:text-ink sm:min-h-control-sm"
              >
                {category}
              </Link>
            ))}
          </SegmentGroup>
        </div>
      ) : null}

      {catalogue.products.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-canvas p-lg text-[length:var(--text-body-md)] text-ink-secondary">
          {filters.q || filters.category || filters.brand
            ? "Nothing matches that. Try a different search."
            : "The catalogue is being prepared. Please check back shortly."}
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-md lg:grid-cols-4">
            {catalogue.products.map((product) => (
              <ShopProductCard key={product.id} product={product} />
            ))}
          </ul>
          {catalogue.total > PER_PAGE ? (
            <div className="mt-lg">
              <TablePagination
                page={page}
                size={PER_PAGE}
                total={catalogue.total}
              />
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}
