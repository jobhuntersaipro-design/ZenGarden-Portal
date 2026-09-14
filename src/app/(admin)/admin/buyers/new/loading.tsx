import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewAdminBuyerLoading() {
  return (
    <PageSkeleton>
      {/* One link above the form here, not the portal route's back link plus
          breadcrumb — the admin room has just `‹ Buyer management`. */}
      <Shimmer className="mb-md h-4 w-28" />
      <HeaderSkeleton />

      <div className="flex max-w-panel-lg flex-col gap-lg">
        {/* Two cards now: the contact block and the folded "More details". */}
        {Array.from({ length: 2 }, (_, card) => (
          <section key={card} className="rounded-lg border border-hairline bg-canvas p-lg">
            <Shimmer className="h-4 w-24" />
            <div className="mt-md flex flex-col gap-md">
              {Array.from({ length: 3 }, (_, field) => (
                <div key={field} className="flex flex-col gap-xxs">
                  <Shimmer className="h-4 w-20" />
                  <Shimmer className="h-control-md w-full rounded-sm" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSkeleton>
  );
}
