import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  Shimmer,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function PurchaseOrdersLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      {/* The count-and-sum line above the table keeps its space, so the table
          does not jump up by a row's height when the figures arrive. */}
      <Shimmer className="mb-sm h-4 w-64" />
      <TableSkeleton rows={10} columns={7} />
    </PageSkeleton>
  );
}
