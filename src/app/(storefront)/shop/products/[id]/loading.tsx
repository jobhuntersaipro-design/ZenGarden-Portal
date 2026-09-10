import { PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

/** Breadcrumb, the gallery/buy-box grid, then the specs list — the product
 * page's own shape (§5.4), not the catalogue grid `loading.tsx` next door. */
export default function ShopProductLoading() {
  return (
    <PageSkeleton>
      <div className="pt-lg">
        <Shimmer className="h-4 w-64" />

        <div className="mt-md grid gap-xl lg:grid-cols-[5fr_7fr]">
          <Shimmer className="aspect-4/3 w-full rounded-lg" />
          <div>
            <Shimmer className="h-4 w-32" />
            <Shimmer className="mt-xs h-9 w-3/4" />
            <Shimmer className="mt-sm h-4 w-48" />
            <Shimmer className="mt-lg h-64 w-full rounded-lg" />
            <div className="mt-lg flex flex-col gap-sm">
              {Array.from({ length: 6 }, (_, index) => (
                <Shimmer key={index} className="h-5 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
