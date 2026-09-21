import {
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

export default function DemandLoading() {
  return (
    <PageSkeleton>
      {/* No action in this header — the board has no primary button. */}
      <HeaderSkeleton action={false} />
      <ControlsSkeleton />
      <TableSkeleton />
    </PageSkeleton>
  );
}
