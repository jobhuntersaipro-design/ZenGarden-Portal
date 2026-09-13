import { HeaderSkeleton, PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function NewAdminCustomerLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <Shimmer className="mb-lg h-64 rounded-lg" />
      <Shimmer className="mb-lg h-64 rounded-lg" />
    </PageSkeleton>
  );
}
