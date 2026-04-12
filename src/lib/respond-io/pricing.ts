export interface PackagePlan {
  name: string;
  speed: string;
  price: number;
  category: string;
  contract: string;
  promo: string;
}

export const PACKAGE_PLANS: PackagePlan[] = [
  // Standard Plans (No Device)
  { name: "Unifi 100Mbps", speed: "100Mbps", price: 89, category: "Standard", contract: "36mo", promo: "6mo free" },
  { name: "Unifi 100Mbps", speed: "100Mbps", price: 89, category: "Standard", contract: "27mo", promo: "3mo free" },
  { name: "Unifi 300Mbps", speed: "300Mbps", price: 129, category: "Standard", contract: "30mo", promo: "6mo free" },
  { name: "Unifi 500Mbps", speed: "500Mbps", price: 149, category: "Standard", contract: "30mo", promo: "6mo free" },
  { name: "Unifi 1Gbps", speed: "1Gbps", price: 249, category: "Standard", contract: "24mo", promo: "" },
  { name: "Unifi 2Gbps", speed: "2Gbps", price: 319, category: "Standard", contract: "24mo", promo: "" },

  // BB Only (WiFi Only)
  { name: "Unifi 300Mbps BB", speed: "300Mbps", price: 129, category: "BB Only", contract: "24mo", promo: "Smart Home / 43\" TV" },
  { name: "Unifi 500Mbps BB", speed: "500Mbps", price: 149, category: "BB Only", contract: "24mo", promo: "55\" TV / iPad / 65\" TV" },
  { name: "Unifi 1Gbps BB", speed: "1Gbps", price: 249, category: "BB Only", contract: "24mo", promo: "65\" TV / 75\" TV" },

  // BB + Netflix
  { name: "Unifi 300Mbps Netflix", speed: "300Mbps", price: 155, category: "BB + Netflix", contract: "24mo", promo: "Smart Home / 43\" TV" },
  { name: "Unifi 500Mbps Netflix", speed: "500Mbps", price: 193, category: "BB + Netflix", contract: "24mo", promo: "55\" TV / iPad / 65\" TV" },
  { name: "Unifi 1Gbps Netflix", speed: "1Gbps", price: 283, category: "BB + Netflix", contract: "24mo", promo: "65\" TV / 75\" TV" },

  // BB + MAX Channels
  { name: "Unifi 300Mbps MAX", speed: "300Mbps", price: 153, category: "BB + MAX", contract: "24mo", promo: "Smart Home / 43\" TV" },
  { name: "Unifi 500Mbps MAX", speed: "500Mbps", price: 173, category: "BB + MAX", contract: "24mo", promo: "55\" TV / iPad / 65\" TV" },

  // Business Fibre Plans
  { name: "Unifi Biz 100Mbps", speed: "100Mbps", price: 99, category: "Business", contract: "24mo", promo: "" },
  { name: "Unifi Biz 300Mbps", speed: "300Mbps", price: 139, category: "Business", contract: "24mo", promo: "Best Seller" },
  { name: "Unifi Biz 500Mbps", speed: "500Mbps", price: 179, category: "Business", contract: "24mo", promo: "" },
  { name: "Unifi Biz 800Mbps", speed: "800Mbps", price: 259, category: "Business", contract: "24mo", promo: "" },
  { name: "Unifi Biz 1Gbps", speed: "1Gbps", price: 319, category: "Business", contract: "24mo", promo: "Best Value" },
  { name: "Unifi Biz 2Gbps", speed: "2Gbps", price: 369, category: "Business", contract: "24mo", promo: "" },
];

/**
 * Look up package price from a speed string like "500Mbps" or "Unifi 500Mbps"
 * Returns the cheapest matching residential plan by default.
 */
export function lookupPackagePrice(packageName: string): number | null {
  if (!packageName) return null;

  const normalized = packageName.toLowerCase().replace(/\s+/g, " ").trim();

  // Try to extract speed from the package name
  const speedMatch = normalized.match(
    /(\d+)\s*(mbps|gbps|mb|gb)/i
  );
  if (!speedMatch) return null;

  const speedNum = parseInt(speedMatch[1]);
  const speedUnit = speedMatch[2].toLowerCase();
  const isGbps = speedUnit.startsWith("gb");
  const speedStr = isGbps ? `${speedNum}Gbps` : `${speedNum}Mbps`;

  const isBusiness =
    normalized.includes("biz") || normalized.includes("business");

  // Find matching plans
  const matches = PACKAGE_PLANS.filter((p) => {
    if (p.speed !== speedStr) return false;
    if (isBusiness) return p.category === "Business";
    return p.category !== "Business";
  });

  if (matches.length === 0) return null;

  // Return cheapest
  return Math.min(...matches.map((p) => p.price));
}

// Valid speeds that Unifi actually offers
const VALID_SPEEDS = new Set([
  "100Mbps", "300Mbps", "500Mbps", "800Mbps", "1Gbps", "2Gbps",
]);

/**
 * Normalize a raw package string to a standard name like "Unifi 500Mbps"
 * Returns null if the speed doesn't match a real Unifi plan.
 */
export function normalizePackageName(raw: string): string | null {
  if (!raw) return null;

  // Match patterns like: 500Mbps, 1Gbps, 1Gb, 300mbps, 2gbps, 100 Mbps
  const speedMatch = raw.match(/(\d+)\s*(mbps|gbps|mb|gb)/i);
  if (!speedMatch) return null;

  const speedNum = parseInt(speedMatch[1]);
  const speedUnit = speedMatch[2].toLowerCase();
  const isGbps = speedUnit.startsWith("gb");
  const speedStr = isGbps ? `${speedNum}Gbps` : `${speedNum}Mbps`;

  // Validate against real Unifi speeds
  if (!VALID_SPEEDS.has(speedStr)) return null;

  const normalized = raw.toLowerCase();
  const isBusiness =
    normalized.includes("biz") || normalized.includes("business");

  return isBusiness ? `Unifi Biz ${speedStr}` : `Unifi ${speedStr}`;
}
