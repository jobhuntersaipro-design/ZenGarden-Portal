import {
  HeaderSkeleton,
  PageSkeleton,
  Shimmer,
} from "@/components/portal/Skeletons";

/**
 * The detail shell: breadcrumb, header, the Lifecycle card with its stepper,
 * then the document / data split (brief §4).
 */
export default function PurchaseOrderLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="mb-xs h-4 w-20" />
      <Shimmer className="mb-xs h-4 w-48" />
      <HeaderSkeleton />

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div className="flex flex-col gap-xs">
            <Shimmer className="h-4 w-24" />
            <Shimmer className="h-6 w-64" />
            <Shimmer className="h-3 w-80" />
          </div>
          <Shimmer className="h-control-md w-48 rounded-pill" />
        </div>
        <Shimmer className="mt-lg h-16 w-full" />
      </section>

      <div className="mt-lg grid gap-lg lg:grid-cols-[45fr_55fr]">
        <div>
          <Shimmer className="mb-xs h-4 w-36" />
          <Shimmer className="h-preview w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-lg">
          {[6, 5].map((rows, index) => (
            <section
              key={index}
              className="rounded-lg border border-hairline bg-canvas p-lg"
            >
              <Shimmer className="mb-sm h-4 w-28" />
              <div className="flex flex-col gap-sm">
                {Array.from({ length: rows }, (_, row) => (
                  <Shimmer key={row} className="h-4 w-full" />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
