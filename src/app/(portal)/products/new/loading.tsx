import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewProductLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="mb-xs h-4 w-20" />
      <Shimmer className="mb-xs h-4 w-44" />
      <HeaderSkeleton />

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
        <Shimmer className="aspect-4/3 w-full rounded-lg" />
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <div className="flex flex-col gap-xs">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-9 w-40" />
          </div>
          <div className="mt-md flex flex-col gap-xs">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-20 w-full rounded-sm" />
          </div>
          <div className="mt-md grid gap-md sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex flex-col gap-xxs">
                <Shimmer className="h-4 w-20" />
                <Shimmer className="h-control-md w-full rounded-sm" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageSkeleton>
  );
}
