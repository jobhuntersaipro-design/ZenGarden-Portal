import { PageSkeleton, Shimmer } from "@/components/portal/Skeletons";

export default function SettingsLoading() {
  return (
    <PageSkeleton>
      <Shimmer className="h-8 w-40" />
      {/* Two cards: Profile, then Security. */}
      <Shimmer className="mt-lg h-96 w-full" />
      <Shimmer className="mt-lg h-48 w-full" />
    </PageSkeleton>
  );
}
