import { ChartSkeleton, HeaderSkeleton, PageSkeleton } from "@/components/portal/Skeletons";

/**
 * Four vocabularies in two columns, which is what arrives. `ChartSkeleton` is
 * the kit's "a card with an eyebrow and a block" and the list is that shape;
 * a fifth skeleton for one screen would be furniture.
 */
export default function CatalogueLoading() {
  return (
    <PageSkeleton>
      <HeaderSkeleton action={false} />
      <div className="grid gap-lg lg:grid-cols-2">
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
        <ChartSkeleton height="h-48" />
      </div>
    </PageSkeleton>
  );
}
