import { BestSellers } from "@/components/shop/home/BestSellers";
import { BrandCards } from "@/components/shop/home/BrandCards";
import { CategoryGrid } from "@/components/shop/home/CategoryGrid";
import { Hero } from "@/components/shop/home/Hero";
import { HowItWorks } from "@/components/shop/home/HowItWorks";
import { NoMarketPanel } from "@/components/shop/NoMarketPanel";
import { loadShopHome } from "@/lib/queries/shop-home";
import { loadShopAudience } from "@/lib/shop-viewer";

export const dynamic = "force-dynamic";

/**
 * The shop's front door.
 *
 * Phase 17 made this public; 2026-09-23 made it a signed-in, market-scoped
 * page. The layout and the proxy turn a guest and a member back before this
 * runs, so the only branch left here is the one nothing above can decide: a
 * real client whose buyer has no market, who gets told why rather than shown
 * an empty shelf.
 */
export default async function ShopHome() {
  const audience = await loadShopAudience();
  if (audience.kind === "unassigned") {
    return (
      <div className="pt-xl">
        <NoMarketPanel />
      </div>
    );
  }

  const home = await loadShopHome(audience.market);

  return (
    <div className="pt-lg">
      <Hero />
      {/* Product directly under the opening band, which is what shrinking the
          hero was for: on a phone the rail used to sit fourth, below a
          full-screen gradient card and How it works, and nothing buyable was
          on the first screen. */}
      <div className="mt-xl">
        <BestSellers products={home.bestSellers} isFallback={home.bestSellersAreFallback} />
      </div>
      <div className="mt-xl">
        <CategoryGrid categories={home.categories} />
      </div>
      <div className="mt-xl">
        <HowItWorks />
      </div>
      <div className="mt-xl">
        <BrandCards brands={home.brands} />
      </div>
    </div>
  );
}
