import {
  ChartSkeleton,
  ControlsSkeleton,
  HeaderSkeleton,
  KpiRowSkeleton,
  PageSkeleton,
  TableSkeleton,
} from "@/components/portal/Skeletons";

/**
 * The Dashboard, and the fallback for any portal route without one of its own.
 * Mirrors the page's order — three tiles, the sales and stage charts, the
 * table — so nothing moves when the real content lands (brief G1).
 */
export default function DashboardLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <KpiRowSkeleton tiles={3} wide />
      <div className="mt-lg flex flex-col gap-lg">
        <ChartSkeleton height="h-72" />
        <ChartSkeleton height="h-72" />
      </div>
      <div className="mt-lg">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </PageSkeleton>
  );
}
