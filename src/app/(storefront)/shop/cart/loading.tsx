import { PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

/** The two-column cart shape (§5.5): a three-row line list beside the
 * summary card, at the same geometry `GuestCart`'s own loading rows use. */
export default function ShopCartLoading() {
  return (
    <PageSkeleton>
      <div className="pt-lg">
        <Shimmer className="h-9 w-56" />
        <Shimmer className="mt-xs h-4 w-72" />

        <div className="mt-lg grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-lg border border-hairline">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="flex items-center gap-md border-b border-hairline p-md last:border-b-0 md:p-lg"
              >
                <Shimmer className="size-cart-thumb shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <Shimmer className="h-4 w-3/4" />
                  <Shimmer className="mt-xs h-3 w-1/2" />
                </div>
                <Shimmer className="hidden h-11 w-28 shrink-0 rounded-pill sm:block" />
                <Shimmer className="h-4 w-14 shrink-0" />
              </div>
            ))}
          </div>
          <Shimmer className="h-80 rounded-lg" />
        </div>
      </div>
    </PageSkeleton>
  );
}
