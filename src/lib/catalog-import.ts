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
/**
 * The sheet spells a few markets more than one way, and the market picker is
 * built from the values stored on products — two spellings would fragment it
 * into two markets nobody meant. Canonical name per entry, keyed by what the
 * sheet writes.
 */
const MARKET_SPELLINGS: Record<string, string> = {
  PHILLIPPINES: "Philippines",
  PHILLIPINES: "Philippines",
  PHILIPPINES: "Philippines",
  "SUPER INDO": "Super Indo",
  "AA PHARMACY": "AA Pharmacy",
};

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
 * "GOAT'S MILK" → "Goat's Milk", "ZEN GARDEN" → "Zen Garden", "L'EVINIA" →
 * "L'Evinia". Tokens with a digit ("2.1L", "60ML") keep their case, because a
 * size reads as a size in capitals, and so do two-letter initialisms, or
 * "AA PHARMACY" comes out as "Aa Pharmacy".
 */
const titleCase = (value: string) =>
  value
    .split(/\s+/)
    .map((word) =>
      /\d/.test(word) || /^[A-Z]{2}$/.test(word)
        ? word.toUpperCase()
        : word
            .toLowerCase()
            .replace(/(^|[-./'])([a-z])/g, (_, before, letter) => before + letter.toUpperCase())
            // Applied after, so the possessive is not capitalised by the rule
            // above that fixes "L'Evinia".
            .replace(/'S\b/, "'s"),
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
      market = MARKET_SPELLINGS[candidate] ?? titleCase(candidate);
      rest = rest.slice(candidate.length).trim();
      // The sheet writes the possessive apart: "LOTUS 'S 2.1L (6)".
      rest = rest.replace(/^'?[Ss]\b\s*/, "");
      break;
    }
  }

  // "(6)" is the usual pack count; "(48PCS/CTN)" the long form on a few rows.
  const pack = rest.match(/\((\d+)\s*(?:PCS?\s*\/\s*CTN)?\)/i);
  const packSize = pack ? Number(pack[1]) : null;
  const size = rest.match(/\b(\d+(?:\.\d+)?\s?(?:ML|L|KG|G))\b/i)?.[1] ?? null;

  // The line is the block minus its pack count and any pallet note, kept in
  // the sheet's own capitals so it matches what the ops team reads there.
  // Pallet notes appear bare ("52CTNS/PALLET"), parenthesised ("(48CTNS/P)")
  // and spaced ("44 CTN/PLT"), sometimes twice in one block.
  const line = rest
    .replace(/\(\d+\s*(?:PCS?\s*\/\s*CTN)?\)/i, "")
    .replace(/\(?\s*-?\s*\d+\s?CTNS?\s*\/\s*(?:PALLET|PLT|P)\s*\)?/gi, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
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
export type ImportReport = {
  products: ImportedProduct[];
  /** Rows whose SKU was already taken even after disambiguation — reported,
   *  never dropped in silence. The sheet lists some lines twice (a domestic
   *  block and an export block), and which is meant is a question for a
   *  person. */
  duplicates: { sku: string; name: string; block: string }[];
  /** Blocks whose variant column holds a nested sub-table rather than a list
   *  of fragrances, so a brand/line/variant model cannot represent them. */
  skipped: { brand: string; block: string; rows: number; sample: string }[];
};

/**
 * A "variant" carrying a size or a pack count is not a fragrance — the sheet
 * has nested a second table inside the column (hair gel is colours × sizes ×
 * packs; the sanitizers are sizes; Kimia Suchi's 240ML row lists bottles,
 * inserts and caps, which are packaging rather than goods). Reading those as
 * one product per row invents products nobody would recognise, so the whole
 * block is set aside for a person to enter.
 */
const NESTED = /\d+\s?(?:ML|L|KG)\b|\(\s*\d+\s*\)|\bPCS\b/i;

/**
 * The catalogue is keyed by SKU, so two real products may never share one.
 * The agreed shape has no pack segment, and the sheet sells the same line in
 * two carton sizes (MR.KING 1.5L by 12 and by 6; the roll-on by 72 and by 12),
 * so a clash takes `-X{pack}` — real information a buyer orders by — and only
 * then a counter, for the pair that differ by neither size nor pack
 * (1L DWASH PUMP and 1L DWASH CAP are both twelves).
 */
function uniqueSku(
  base: string,
  packSize: number | null,
  taken: Map<string, number | null>,
): string | null {
  if (!taken.has(base)) return base;
  // Only when the pack is what differs. Two twelves both taking `-X12` would
  // assert a distinction the packs do not make.
  if (packSize && taken.get(base) !== packSize && !taken.has(`${base}-X${packSize}`)) {
    return `${base}-X${packSize}`;
  }
  for (let n = 2; n <= 9; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return null;
}

export function toProducts(rows: SheetLabels[]): ImportReport {
  const taken = new Map<string, number | null>();
  const products: ImportedProduct[] = [];
  const duplicates: ImportReport["duplicates"] = [];
  const skipped: ImportReport["skipped"] = [];

  // Grouped first: whether a block nests a sub-table is a property of the
  // block, not of any one row in it.
  const blocks = new Map<string, SheetLabels[]>();
  for (const row of rows) {
    if (!row.brand || !row.block) continue;
    const key = `${row.brand}\u0000${row.block}`;
    const group = blocks.get(key);
    if (group) group.push(row);
    else blocks.set(key, [row]);
  }

  for (const group of blocks.values()) {
    const first = group[0];
    const nested = group.find((r) => NESTED.test(r.variant));
    if (nested) {
      skipped.push({
        brand: first.brand,
        block: first.block,
        rows: group.length,
        sample: nested.variant,
      });
      continue;
    }

    const { market, line, size, packSize } = parseBlock(first.block);
    if (!line) continue;
    const brand = titleCase(first.brand);
    const category = categorise(line);

    for (const row of group) {
      const variant = row.variant ? titleCase(stripFootnotes(row.variant)) : null;
      const base = generateSku({ brand, category, size, variant, market });
      const name = [line, variant].filter(Boolean).join(" — ");
      const sku = uniqueSku(base, packSize, taken);
      if (!sku) {
        duplicates.push({ sku: base, name, block: row.block });
        continue;
      }
      taken.set(sku, packSize);
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
  }
  return { products, duplicates, skipped };
}
