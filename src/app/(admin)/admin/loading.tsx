import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

/** The admin room uses the same loading language as the portal (brief G1). */
export default function AdminLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <TableSkeleton rows={8} columns={6} />
    </PageSkeleton>
  );
}
