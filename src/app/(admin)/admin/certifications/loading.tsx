import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function CertificationLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <TableSkeleton rows={8} columns={5} />
    </PageSkeleton>
  );
}
