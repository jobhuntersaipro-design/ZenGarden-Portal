import {
  ChartSkeleton,
  ControlsSkeleton,
  HeaderSkeleton,
  KpiRowSkeleton,
  PageSkeleton,
  Shimmer,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function BuyerLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="mb-xs h-4 w-20" />
      <Shimmer className="mb-xs h-4 w-40" />
      <HeaderSkeleton />
      <ControlsSkeleton />
      {/* Five tiles over six tracks, the money tile spanning two. */}
      <KpiRowSkeleton tiles={5} columns={6} wide compact />
      <ChartSkeleton height="h-72" />
      <div className="mt-lg">
        <ChartSkeleton height="h-64" />
      </div>
      <div className="mt-lg grid gap-lg lg:grid-cols-2">
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
      </div>
      <div className="mt-lg">
        <TableSkeleton rows={6} columns={7} />
      </div>
    </PageSkeleton>
  );
}
