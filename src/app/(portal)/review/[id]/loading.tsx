import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

/**
 * Its own file rather than falling through to the group's Dashboard skeleton:
 * a skeleton that draws a different page than the one arriving is worse than
 * none, because the layout still jumps when the real thing lands.
 *
 * The source column reserves `h-preview`, the same height `DocumentPreview`
 * and `RunningPoller` hold, so the two columns line up from the first frame.
 */
export default function ReviewLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <div className="grid gap-xl lg:grid-cols-2">
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
