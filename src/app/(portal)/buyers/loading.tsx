import {
  ControlsSkeleton,
  HeaderSkeleton,
  KpiRowSkeleton,
  PageSkeleton,
  Shimmer,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function BuyersLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <KpiRowSkeleton compact />
      {/* The attention strip. */}
      <Shimmer className="mb-md h-control-sm w-full rounded-lg" />
      <TableSkeleton rows={10} columns={7} />
    </PageSkeleton>
  );
}
