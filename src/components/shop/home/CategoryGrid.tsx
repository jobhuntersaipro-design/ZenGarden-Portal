import Link from "next/link";
import { shopHref } from "@/lib/shop-routes";

/** First two letters of the first word, upper-cased — not the person-name
 * `initials()` in `src/lib/avatar.ts`, which takes the first letter of each
 * of the first two words and would turn "Shower cream & gel" into "SC"
 * instead of "SH". */
function categoryInitials(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.slice(0, 2).toUpperCase();
}

export function CategoryGrid({
  categories,
}: {
  categories: { name: string; count: number }[];
}) {
  if (categories.length === 0) return null;

  return (
    <section>
      <h2 className="mb-md text-[length:var(--text-heading-md)] font-[650] text-ink">
        Shop by category
      </h2>
      <div className="grid grid-cols-2 gap-md md:grid-cols-4">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={shopHref.catalogue({ category: category.name })}
            className="flex flex-col items-center gap-sm rounded-lg border border-hairline p-lg text-center hover:border-hairline-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full bg-surface font-display text-[length:var(--text-body-lg)] font-semibold text-focus"
            >
              {categoryInitials(category.name)}
            </span>
            <span className="text-[length:var(--text-body-sm)] font-semibold text-ink">
              {category.name}
            </span>
            <span className="text-[length:var(--text-caption)] text-ink-tertiary">
              {category.count} product{category.count === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
