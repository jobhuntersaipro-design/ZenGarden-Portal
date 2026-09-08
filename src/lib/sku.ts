import type { ProductCategory } from "@/lib/product-categories";

/**
 * SKU generation for the imported catalog.
 *
 * The customer's master list has no product codes, and the portal requires
 * one per product because a code is the only identity a purchase-order line
 * can carry. So codes are derived from what the sheet *does* have — brand,
 * type, size, variant, market — in a shape a person can read back:
 *
 *   ZEN-SC-2100-GM-VN   ZEN Shower cream 2.1L, Goat's Milk, Vietnam
 *   MRK-DW-1500-LE-MY   Mr. King Dishwash 1.5L, Lemon, Malaysia
 *
 * Each table below is a starting vocabulary, not a closed one: a value with
 * no entry falls back to its initials, so an unknown market or a new fragrance
 * still produces a code. Generated codes are ordinary SKUs afterwards —
 * editable, and matched exactly like any other.
 */

export type SkuField = "brand" | "variant" | "market";

const BRANDS: Record<string, string> = {
  "zen garden": "ZEN",
  zen: "ZEN",
  "zen dlux": "ZDX",
  "mr king": "MRK",
  "l hands": "LHM",
  "loving hands": "LHM",
  everfresh: "EVF",
  hilo: "HILO",
  "nature key": "NKY",
  aara: "AARA",
  "hyang gii": "HYG",
  "fair price": "FPR",
  "morning spring": "MSP",
  lotus: "LOTUS",
  "buddha therapy": "BTH",
  levinia: "LEV",
  meiri: "MEIRI",
  darce: "DARCE",
  kimia: "KIMIA",
  suchi: "SUCHI",
  friends: "FRND",
  level: "LEVEL",
};

const VARIANTS: Record<string, string> = {
  "goats milk": "GM",
  "goat milk": "GM",
  lavender: "LV",
  papaya: "PP",
  "royal jelly": "RJ",
  "green tea": "GT",
  carrot: "CR",
  avocado: "AV",
  "oat milk": "OM",
  "almond milk": "AM",
  "shea butter": "SB",
  strawberry: "SB2",
  "sea salt": "SS",
  charcoal: "CH",
  lemon: "LE",
  lime: "LI",
  "aloe vera": "AL",
  collagen: "CO",
  regular: "RG",
  "colour care": "CC",
  "anti bac": "AB",
  "anti dandruff": "AD",
  "hair fall control": "HF",
  "soft smooth": "SM",
  "wet look": "WL",
  "extra strong": "XS",
  normal: "NM",
  sunflower: "SF",
  fresh: "FR",
  gold: "GD",
  pink: "PK",
  purple: "PU",
};

const MARKETS: Record<string, string> = {
  malaysia: "MY",
  vietnam: "VN",
  india: "IN",
  indonesia: "ID",
  "super indo": "ID",
  philippines: "PH",
  phillippines: "PH",
  phillipines: "PH",
  thailand: "TH",
  singapore: "SG",
  arab: "AE",
  uae: "AE",
  saudi: "SA",
  qatar: "QA",
  oman: "OM",
  iraq: "IQ",
  libya: "LY",
  seychelles: "SC",
  "hong kong": "HK",
  china: "CN",
};

const TABLES: Record<SkuField, Record<string, string>> = {
  brand: BRANDS,
  variant: VARIANTS,
  market: MARKETS,
};

/** Category → the two-letter type segment. */
const TYPES: Record<ProductCategory, string> = {
  "Shower cream & gel": "SC",
  "Hand wash & soap": "HW",
  "Hair care": "HC",
  "Body care": "BC",
  "Hand sanitizer": "HS",
  "Dishwash & cleanser": "DW",
  "Laundry detergent": "LD",
  Fragrance: "FG",
  Uncategorised: "XX",
};

/** "Goat's Milk (Green)" → "goats milk green": what every lookup keys on. */
const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The code for one segment. Table first; otherwise initials, or the whole
 * word when there is only one, since "M" for Mydin tells nobody anything.
 */
export function skuCode(field: SkuField, value: string): string {
  const key = normalise(value);
  const known = TABLES[field][key];
  if (known) return known;
  const words = key.split(" ").filter(Boolean);
  if (words.length === 1) return words[0].toUpperCase();
  return words.map((word) => word[0]).join("").toUpperCase();
}

/**
 * "2.1L" → "2100", "500ML" → "0500", "2.9KG" → "2900", "60ML" → "0060".
 * Litres and kilograms become millilitres and grams so that codes sort by
 * size as text. Four digits covers everything up to 9.999L; the 25L drums
 * simply run to five.
 */
export function sizeCode(size: string): string | null {
  const match = size
    .toUpperCase()
    .replace(/\s+/g, "")
    .match(/^(\d+(?:\.\d+)?)(ML|L|KG|G)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const base = unit === "L" || unit === "KG" ? amount * 1000 : amount;
  return String(Math.round(base)).padStart(4, "0");
}

export function generateSku(product: {
  brand: string | null;
  category: ProductCategory;
  size: string | null;
  variant: string | null;
  market: string | null;
}): string {
  const segments = [
    product.brand ? skuCode("brand", product.brand) : null,
    TYPES[product.category],
    product.size ? sizeCode(product.size) : null,
    product.variant ? skuCode("variant", product.variant) : null,
    product.market ? skuCode("market", product.market) : null,
  ];
  return segments
    .filter((segment): segment is string => Boolean(segment))
    .join("-")
    .replace(/[^A-Z0-9-]/g, "");
}
