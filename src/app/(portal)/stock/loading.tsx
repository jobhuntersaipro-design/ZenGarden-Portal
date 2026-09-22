import { ChartSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/portal/Skeletons";

/** The sheet, then the feed. */
export default function StockLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <ChartSkeleton height="h-96" />
      <ChartSkeleton height="h-48" />
    </PageSkeleton>
  );
}
