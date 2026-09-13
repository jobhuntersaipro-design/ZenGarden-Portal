import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewAdminCustomerLoading() {
  return (
    <PageSkeleton>
      {/* One link above the form here, not the portal route's back link plus
          breadcrumb — the admin room has just `‹ Customers`. */}
      <Shimmer className="mb-md h-4 w-28" />
      <HeaderSkeleton />

      <div className="flex max-w-panel-lg flex-col gap-lg">
        {Array.from({ length: 3 }, (_, card) => (
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
