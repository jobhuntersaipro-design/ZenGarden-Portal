/**
 * Twelve products, per the design reference §5. `drift` is the yearly price
 * movement (−9% to +18%) applied from PRICE_EPOCH, so a line's billed unit
 * price drifts away from the list price over the seeded year.
 * Three carry no image, matching the canvas.
 */
export const PRICE_EPOCH = new Date("2025-09-01T00:00:00+08:00");

export const PRODUCTS = [
  { sku: "SCR-BAM-180", name: "Bamboo garden screen 1.8m", category: "Screens & fencing", unit: "panel", base: 189.0, drift: 0.06, images: 2 },
  { sku: "STN-GRA-040", name: "Granite stepping stone 40cm", category: "Stone", unit: "piece", base: 42.5, drift: 0.11, images: 2 },
  { sku: "STN-PEB-020", name: "River pebble, 20kg bag", category: "Stone", unit: "bag", base: 28.0, drift: 0.04, images: 1 },
  { sku: "PLT-MAP-150", name: "Japanese maple, 1.5m", category: "Plants", unit: "tree", base: 480.0, drift: 0.18, images: 3 },
  { sku: "FUR-CED-120", name: "Cedar bench 1.2m", category: "Furniture", unit: "unit", base: 640.0, drift: 0.09, images: 2 },
  { sku: "STN-GRV-025", name: "Raked gravel, white, 25kg", category: "Stone", unit: "bag", base: 24.0, drift: -0.03, images: 0 },
  { sku: "DEC-LAN-060", name: "Stone lantern 60cm", category: "Stone", unit: "piece", base: 720.0, drift: 0.13, images: 2 },
  { sku: "PLT-MOS-050", name: "Moss mat 50×50", category: "Plants", unit: "mat", base: 55.0, drift: -0.09, images: 0 },
  { sku: "DEK-TEA-030", name: "Teak deck tile 30cm", category: "Decking", unit: "tile", base: 36.0, drift: 0.15, images: 2 },
  { sku: "PLT-BON-010", name: "Bonsai juniper, 10yr", category: "Plants", unit: "tree", base: 1250.0, drift: 0.16, images: 3 },
  { sku: "STR-PER-330", name: "Timber pergola kit 3×3m", category: "Structures", unit: "kit", base: 3200.0, drift: 0.07, images: 0 },
  { sku: "WAT-LIN-450", name: "Koi pond liner 4×5m", category: "Water", unit: "roll", base: 890.0, drift: -0.05, images: 2 },
] as const;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** base × (1 + drift × years since epoch), before the ±2% line noise. */
export function driftedPrice(base: number, drift: number, on: Date): number {
  const years = (on.getTime() - PRICE_EPOCH.getTime()) / MS_PER_YEAR;
  return base * (1 + drift * years);
}
