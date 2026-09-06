import {
  CardGridSkeleton,
  ControlsSkeleton,
  HeaderSkeleton,
  KpiRowSkeleton,
  PageSkeleton,
} from "@/components/portal/Skeletons";

export default function ProductsLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton />
      <KpiRowSkeleton compact />
      <ControlsSkeleton />
      {/* Twelve, the grid view's default page size — the same number of cards
          the page is about to render. */}
      <CardGridSkeleton />
    </PageSkeleton>
  );
}
