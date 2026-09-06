import {
  ChartSkeleton,
  HeaderSkeleton,
  KpiRowSkeleton,
  PageSkeleton,
  Shimmer,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function ProductLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="mb-xs h-4 w-20" />
      <Shimmer className="mb-xs h-4 w-56" />
      <HeaderSkeleton />

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
        <Shimmer className="aspect-4/3 w-full rounded-lg" />
        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <div className="flex flex-wrap items-start justify-between gap-md">
            <div className="flex flex-col gap-xs">
              <Shimmer className="h-4 w-24" />
              <Shimmer className="h-9 w-40" />
            </div>
            <div className="flex flex-col items-end gap-xs">
              <Shimmer className="h-4 w-28" />
              <Shimmer className="h-7 w-32" />
            </div>
          </div>
          <div className="mt-md grid gap-sm sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-xxs">
                <Shimmer className="h-4 w-20" />
                <Shimmer className="h-4 w-28" />
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-lg">
        <KpiRowSkeleton tiles={6} columns={6} compact />
      </div>
      <ChartSkeleton height="h-64" />
      <div className="mt-lg">
        <TableSkeleton rows={10} columns={8} />
      </div>
    </PageSkeleton>
  );
}
