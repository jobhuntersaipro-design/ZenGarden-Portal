import Link from "next/link";
import { ProductThumb } from "@/components/products/ProductThumb";
import { CategoryMark } from "@/components/shop/home/CategoryMark";
import { shopHref } from "@/lib/shop-routes";
import type { ShopHomeCategory } from "@/lib/queries/shop-home";

/**
 * A picture per category, with the category's own photographed product where
 * one exists and a drawn mark where none does.
 *
 * It used to be a two-letter monogram, which is not an identifier: three of
 * the nine seeded categories reduce to `HA`, and production drew two
 * identical `HA` circles next to each other. `CategoryMark` carries the
 * reasoning; what matters here is that the tile never identifies a category
 * by letters again.
 *
 * `ProductThumb` does the image, rather than a plain `<img>`, for the defect
 * it already handles: a presigned R2 URL expires and its object can be gone,
 * and an image that fails before hydration never replays its error. The mark
 * is that component's `fallback`, so a photo that goes missing lands on the
 * drawing instead of a broken-image icon.
 */
export function CategoryGrid({ categories }: { categories: ShopHomeCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-md text-[length:var(--text-heading-md)] font-[650] text-ink">
        Shop by category
      </h2>
      <ul className="grid list-none grid-cols-2 gap-md p-0 md:grid-cols-4">
        {categories.map((category) => (
          <li key={category.name} className="flex min-w-0">
            {/* `h-full` on a flex column is what keeps a row's tiles level:
                a name that wraps to two lines makes its tile taller, and
                without this the shorter one in the same row stops early and
                the row reads as ragged. */}
            <Link
              href={shopHref.catalogue({ category: category.name })}
              className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-hairline hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              {/* A fixed ratio rather than a height, so the row of tiles keeps
                  its shape from 390 up to the widest desktop column. */}
              <span className="flex aspect-4/3 shrink-0 items-center justify-center bg-surface">
                <ProductThumb
                  name={category.name}
                  url={category.imageUrl}
                  fallback={<CategoryMark name={category.name} />}
                />
              </span>
              <span className="block grow p-sm">
                {/* The name wraps rather than truncating: it is the only thing
                    naming the destination, and `Dishwash & cleanser` does not
                    fit one line in a half-width tile on a phone. */}
                <span className="block text-[length:var(--text-body-sm)] font-semibold text-ink">
                  {category.name}
                </span>
                <span className="mt-xxs block text-[length:var(--text-caption)] text-ink-tertiary">
                  {category.count} product{category.count === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
