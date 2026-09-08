import type { WorkSheet } from "xlsx";
import { utils } from "xlsx";
import {
  isProductCategory,
  type ProductCategory,
} from "@/lib/product-categories";
import { generateSku } from "@/lib/sku";

/**
 * Reading the customer's inventory master list into products.
 *
 * The sheet is a delivery-planning grid, not a catalog: hundreds of columns
 * of stock movements to the right, and down the left three label columns
 * that together say what each row *is* —
 *
 *   A  brand, merged across a block            ZEN GARDEN
 *   B  market + line, merged across a block    VIETNAM ZEN 2.1L (6)
 *   C  variant, one per row                    GOAT'S MILK
 *
 * Merged cells hold their value in the top-left cell only, so a naïve row
 * read sees the brand once and blanks after it. `!merges` says which ranges
 * are merged; every cell inside one takes the anchor's value.
 */

export type SheetLabels = { brand: string; block: string; variant: string };

export type ImportedProduct = {
  brand: string;
  market: string | null;
  line: string;
  size: string | null;
  packSize: number | null;
  variant: string | null;
  category: ProductCategory;
  name: string;
  sku: string;
  unit: "carton";
};

/** Reads column `col` of every row, filling merged ranges down from their anchor. */
export function readLabelColumns(
  ws: WorkSheet,
  columns: { brand: number; block: number; variant: number },
): SheetLabels[] {
  const range = utils.decode_range(ws["!ref"] ?? "A1");
  const merges = ws["!merges"] ?? [];

  const anchorFor = (r: number, c: number) => {
    const merge = merges.find(
      (m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c,
    );
    return merge ? merge.s : { r, c };
  };

  const text = (r: number, c: number): string => {
    const anchor = anchorFor(r, c);
    const cell = ws[utils.encode_cell(anchor)];
    const value = cell?.v;
    return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
  };

  const rows: SheetLabels[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    rows.push({
      brand: text(r, columns.brand),
      block: text(r, columns.block),
      variant: text(r, columns.variant),
    });
  }
  return rows;
}

/**
 * "VIETNAM ZEN 2.1L (6)" → market Vietnam, line "ZEN 2.1L", size "2.1L",
 * pack 6. The market is an upper-case prefix the sheet paints red; it is
 * absent for the home market, and a customer name (MYDIN, HERO MARKET) sits
 * in the same place.
 */
const KNOWN_MARKETS = [
  "VIETNAM",
  "INDIA",
  "INDONESIA",
  "SUPER INDO",
  "PHILIPPINES",
  "PHILLIPPINES",
  "PHILLIPINES",
  "THAILAND",
  "SINGAPORE",
  "ARAB",
  "SAUDI",
  "QATAR",
  "OMAN",
  "IRAQ",
  "LIBYA",
  "SEYCHELLES",
  "HONG KONG",
  "MYDIN",
  "ECONSAVE",
  "HERO MARKET",
  "AA PHARMACY",
  "YUKAZAN",
  "LOTUS",
];

/**
 * "GOAT'S MILK" → "Goat's Milk", "ZEN GARDEN" → "Zen Garden". Tokens with a
 * digit ("2.1L", "60ML") keep their case: a size reads as a size in capitals.
 */
const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .map((word) =>
      /\d/.test(word)
        ? word.toUpperCase()
        : word
            .toLowerCase()
            .replace(/(^|[-./])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
            .replace(/'S\b/i, "'s"),
    )
    .join(" ");

/** "ROYAL JELLY [19]" → "ROYAL JELLY": the sheet's footnote markers. */
const stripFootnotes = (value: string) => value.replace(/\s*\[\d+\]\s*/g, " ").trim();

export function parseBlock(block: string): {
  market: string | null;
  line: string;
  size: string | null;
  packSize: number | null;
} {
  let rest = block.trim();
  let market: string | null = null;
  const upper = rest.toUpperCase();
  for (const candidate of KNOWN_MARKETS) {
    if (upper.startsWith(candidate + " ")) {
      market = titleCase(candidate);
      rest = rest.slice(candidate.length).trim();
      break;
    }
  }

  // "(6)" is the usual pack count; "(48PCS/CTN)" the long form on a few rows.
  const pack = rest.match(/\((\d+)\s*(?:PCS?\s*\/\s*CTN)?\)/i);
  const packSize = pack ? Number(pack[1]) : null;
  const size = rest.match(/\b(\d+(?:\.\d+)?\s?(?:ML|L|KG|G))\b/i)?.[1] ?? null;

  // The line is the block minus its pack count and any pallet note, kept in
  // the sheet's own capitals so it matches what the ops team reads there.
  const line = rest
    .replace(/\(\d+\s*(?:PCS?\s*\/\s*CTN)?\)/i, "")
    .replace(/-?\s*\d+\s?CTNS?\s*\/\s*(?:PALLET|PLT|P)\b/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*$/, "")
    .trim()
    .toUpperCase();

  return { market, line, size: size?.toUpperCase().replace(/\s/g, "") ?? null, packSize };
}

/** Category from the words in the line; anything unrecognised is Uncategorised. */
export function categorise(line: string): ProductCategory {
  const l = line.toUpperCase();
  const pick = (category: string): ProductCategory =>
    isProductCategory(category) ? category : "Uncategorised";
  if (/SANITI[SZ]ER/.test(l)) return pick("Hand sanitizer");
  if (/H\/?W(ASH)?\b|HAND WASH|HAND SOAP|H\/WASH/.test(l)) return pick("Hand wash & soap");
  if (/SHAMPOO|CONDITIONER|HAIR GEL|HAIR/.test(l)) return pick("Hair care");
  if (/DETERGENT|D'?LUX/.test(l)) return pick("Laundry detergent");
  if (/D\/?WASH|DISHWASH|CREAM CLEANSER|MR\.? ?KING/.test(l)) return pick("Dishwash & cleanser");
  if (/PERFUME|FRAGRANCE|ROLL ON|ROLL-ON/.test(l)) return pick("Fragrance");
  if (/OIL|BABY|LOTION|ROLL/.test(l)) return pick("Body care");
  if (/S\/?C\b|SHOWER|SCRUB|S\/G\b|GEL|REFILL|\d(\.\d)?L\b|ML\b/.test(l)) {
    return pick("Shower cream & gel");
  }
  return "Uncategorised";
}

/**
 * Label rows → products, one per variant. Rows with no variant are a line
 * without flavours (a hand sanitizer, a hair gel size) and become one product
 * each. Rows that carry no brand or no block are not products — headers,
 * totals, the pallet notes — and are skipped.
 */
export function toProducts(rows: SheetLabels[]): ImportedProduct[] {
  const seen = new Set<string>();
  const products: ImportedProduct[] = [];

  for (const row of rows) {
    if (!row.brand || !row.block) continue;
    const { market, line, size, packSize } = parseBlock(row.block);
    if (!line) continue;

    const brand = titleCase(row.brand);
    const variant = row.variant ? titleCase(stripFootnotes(row.variant)) : null;
    const category = categorise(line);
    const sku = generateSku({ brand, category, size, variant, market });
    if (seen.has(sku)) continue;
    seen.add(sku);

    const name = [line, variant].filter(Boolean).join(" — ");
    products.push({
      brand,
      market,
      line,
      size,
      packSize,
      variant,
      category,
      name,
      sku,
      unit: "carton",
    });
  }
  return products;
}
