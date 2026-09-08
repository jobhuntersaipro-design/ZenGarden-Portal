/**
 * Twelve products shaped like the customer's real catalog — ZEN shower cream
 * and hand wash, Mr. King dishwash, Zen D'Lux detergent — one per variant, the
 * way the import creates them. `drift` is the yearly price movement (−9% to
 * +18%) applied from PRICE_EPOCH, so a line's billed unit price drifts away
 * from the list price over the seeded year. Three carry no image, matching
 * the canvas. Prices are per carton, which is what a PO orders.
 */
export const PRICE_EPOCH = new Date("2025-09-01T00:00:00+08:00");

export const PRODUCTS = [
  { sku: "ZEN-SC-2100-GM-MY", name: "ZEN 2.1L — Goat's Milk", brand: "Zen Garden", variant: "Goat's Milk", packSize: 6, market: "Malaysia", category: "Shower cream & gel", unit: "carton", base: 189.0, drift: 0.06, images: 2 },
  { sku: "ZEN-SC-2100-LV-MY", name: "ZEN 2.1L — Lavender", brand: "Zen Garden", variant: "Lavender", packSize: 6, market: "Malaysia", category: "Shower cream & gel", unit: "carton", base: 189.0, drift: 0.11, images: 2 },
  { sku: "ZEN-SC-2100-GM-VN", name: "ZEN 2.1L — Goat's Milk", brand: "Zen Garden", variant: "Goat's Milk", packSize: 6, market: "Vietnam", category: "Shower cream & gel", unit: "carton", base: 176.0, drift: 0.04, images: 1 },
  { sku: "ZEN-SC-1000-RJ-MY", name: "ZEN 1L — Royal Jelly", brand: "Zen Garden", variant: "Royal Jelly", packSize: 12, market: "Malaysia", category: "Shower cream & gel", unit: "carton", base: 228.0, drift: 0.18, images: 3 },
  { sku: "ZEN-HW-0500-GM-MY", name: "H/WASH 500ML — Goat's Milk", brand: "Zen Garden", variant: "Goat's Milk", packSize: 24, market: "Malaysia", category: "Hand wash & soap", unit: "carton", base: 168.0, drift: 0.09, images: 2 },
  { sku: "ZEN-HW-0500-SB2-MYDIN", name: "H/WASH 500ML — Strawberry", brand: "Zen Garden", variant: "Strawberry", packSize: 24, market: "Mydin", category: "Hand wash & soap", unit: "carton", base: 160.0, drift: -0.03, images: 0 },
  { sku: "ZEN-HC-1000-AD-MY", name: "ZEN HAIR SHAMPOO 1L — Anti-Dandruff", brand: "Zen Garden", variant: "Anti-Dandruff", packSize: 12, market: "Malaysia", category: "Hair care", unit: "carton", base: 240.0, drift: 0.13, images: 2 },
  { sku: "MRK-DW-1500-LE-MY", name: "MR.KING 1.5L — Lemon", brand: "Mr. King", variant: "Lemon", packSize: 12, market: "Malaysia", category: "Dishwash & cleanser", unit: "carton", base: 96.0, drift: -0.09, images: 0 },
  { sku: "MRK-DW-1500-LI-MY", name: "MR.KING 1.5L — Lime", brand: "Mr. King", variant: "Lime", packSize: 12, market: "Malaysia", category: "Dishwash & cleanser", unit: "carton", base: 96.0, drift: 0.15, images: 2 },
  { sku: "ZDX-LD-2900-GD-MY", name: "ZEN D'LUX 2.9KG LIQUID DETERGENT — Gold", brand: "Zen D'Lux", variant: "Gold", packSize: 4, market: "Malaysia", category: "Laundry detergent", unit: "carton", base: 84.0, drift: 0.16, images: 3 },
  { sku: "ZEN-HS-0060-FR-MY", name: "HAND SANITIZER 60ML — Fresh", brand: "Zen Garden", variant: "Fresh", packSize: 48, market: "Malaysia", category: "Hand sanitizer", unit: "carton", base: 120.0, drift: 0.07, images: 0 },
  { sku: "ZEN-FG-0500-STYLE-MY", name: "500ML FINE FRAGRANCE SHOWER GEL — Style", brand: "Zen Garden", variant: "Style", packSize: 24, market: "Malaysia", category: "Fragrance", unit: "carton", base: 312.0, drift: -0.05, images: 2 },
] as const;

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** base × (1 + drift × years since epoch), before the ±2% line noise. */
export function driftedPrice(base: number, drift: number, on: Date): number {
  const years = (on.getTime() - PRICE_EPOCH.getTime()) / MS_PER_YEAR;
  return base * (1 + drift * years);
}
