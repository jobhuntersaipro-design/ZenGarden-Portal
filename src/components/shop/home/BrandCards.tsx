export function BrandCards({
  brands,
}: {
  brands: { name: string; categories: string[] }[];
}) {
  if (brands.length === 0) return null;

  return (
    <section>
      <h2 className="mb-md text-[length:var(--text-heading-md)] font-[650] text-ink">
        Our brands
      </h2>
      <div className="grid gap-md sm:grid-cols-3">
        {brands.map((brand) => (
          <div key={brand.name} className="rounded-lg border border-hairline bg-surface p-lg">
            <p className="font-display text-[length:var(--text-heading-sm)] font-[650] text-ink">
              {brand.name}
            </p>
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              {brand.categories.join(", ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
