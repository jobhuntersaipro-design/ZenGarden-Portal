import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function AdminCustomersLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
