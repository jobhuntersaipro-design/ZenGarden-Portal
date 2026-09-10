import { BestSellers } from "@/components/shop/home/BestSellers";
import { BrandCards } from "@/components/shop/home/BrandCards";
import { CategoryGrid } from "@/components/shop/home/CategoryGrid";
import { Hero } from "@/components/shop/home/Hero";
import { HowItWorks } from "@/components/shop/home/HowItWorks";
import { loadShopHome } from "@/lib/queries/shop-home";

export const dynamic = "force-dynamic";

/**
 * The shop's front door. No `requireClient()` — a guest sees exactly this,
 * per Phase 17: browsing and pricing are public, and a client is turned back
 * only on the screens that actually need a buyer (cart, orders).
 */
export default async function ShopHome() {
  const home = await loadShopHome();

  return (
    <div className="pt-lg">
      <Hero />
      <div className="mt-lg">
        <HowItWorks />
      </div>
      <div className="mt-xl">
        <CategoryGrid categories={home.categories} />
      </div>
      <div className="mt-xl">
        <BestSellers products={home.bestSellers} isFallback={home.bestSellersAreFallback} />
      </div>
      <div className="mt-xl">
        <BrandCards brands={home.brands} />
      </div>
    </div>
  );
}
