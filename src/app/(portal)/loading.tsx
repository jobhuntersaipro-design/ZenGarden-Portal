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
 * Mirrors the page's order — three tiles, one trend, the two status bars, the
 * table — so nothing moves when the real content lands (brief G1).
 */
export default function DashboardLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <ControlsSkeleton />
      <KpiRowSkeleton tiles={3} wide />
      <div className="mt-lg">
        <ChartSkeleton height="h-72" />
      </div>
      <section className="mt-lg grid gap-lg rounded-lg border border-hairline bg-canvas p-lg lg:grid-cols-2">
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-sm">
            <div className="h-3.5 w-full rounded-pill bg-surface-soft" />
            <div className="flex flex-wrap gap-md">
              {[0, 1, 2, 3].map((entry) => (
                <div
                  key={entry}
                  aria-hidden
                  className="h-3 w-24 animate-pulse rounded-sm bg-surface-soft"
                />
              ))}
            </div>
          </div>
        ))}
      </section>
      <div className="mt-lg">
        <TableSkeleton rows={10} columns={7} />
      </div>
    </PageSkeleton>
  );
}
