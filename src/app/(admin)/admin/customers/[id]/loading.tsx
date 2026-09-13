import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function AdminCustomerLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <div className="grid gap-lg lg:grid-cols-2">
        <Shimmer className="h-64 rounded-lg" />
        <Shimmer className="h-64 rounded-lg" />
      </div>
      <Shimmer className="mt-lg h-96 rounded-lg" />
    </PageSkeleton>
  );
}
