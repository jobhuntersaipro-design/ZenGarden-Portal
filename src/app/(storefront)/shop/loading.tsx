import { CardGridSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

/** Hero block, then two rows of four cards — the home page's own shape. */
export default function ShopHomeLoading() {
  return (
    <PageSkeleton>
      <div className="pt-lg">
        <Shimmer className="h-64 w-full rounded-xxl sm:h-72" />
        <div className="mt-xl">
          <Shimmer className="mb-md h-7 w-48" />
          <CardGridSkeleton cards={4} />
        </div>
        <div className="mt-xl">
          <Shimmer className="mb-md h-7 w-48" />
          <CardGridSkeleton cards={4} />
        </div>
      </div>
    </PageSkeleton>
  );
}
