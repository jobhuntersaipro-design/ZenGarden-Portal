import { ChartSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/portal/Skeletons";

/** One card, which is the whole page. */
export default function TestDataLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <ChartSkeleton height="h-48" />
    </PageSkeleton>
  );
}
