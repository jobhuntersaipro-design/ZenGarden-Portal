import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

/** The detail page's shape: the file beside its fields, as on PO review. */
export default function BookingLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <div className="grid gap-xl xl:grid-cols-document">
        <Shimmer className="h-preview w-full rounded-lg" />
        <div className="flex flex-col gap-md">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="flex flex-col gap-xxs">
              <Shimmer className="h-4 w-28" />
              <Shimmer className="h-control-md w-full rounded-sm" />
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}
