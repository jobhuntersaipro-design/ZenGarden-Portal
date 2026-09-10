import {
  CardGridSkeleton,
  ControlsSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/portal/Skeletons";
import { SHOP_PER_PAGE } from "@/lib/shop-filters";

/** Breadcrumb + heading, the filter chip row, then the 24-card grid (§5.3). */
export default function ShopCatalogueLoading() {
  return (
    <PageSkeleton>
      <div className="pt-lg">
        <HeaderSkeleton action={false} />
        <ControlsSkeleton />
        <div className="mt-lg">
          <CardGridSkeleton cards={SHOP_PER_PAGE} />
        </div>
      </div>
    </PageSkeleton>
  );
}
