import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function UploadLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      {/* The drop zone at its resting height, so the page it becomes is
          already the shape the reader is looking at. */}
      <Shimmer className="min-h-80 w-full rounded-xxl" />
      <Shimmer className="mt-md h-16 w-full rounded-lg" />
    </PageSkeleton>
  );
}
