import { normaliseSku } from "@/lib/validation/products";

/** Below this, no candidate is offered at all. */
export const SUGGEST_MIN = 45;
/** At or above, the chip reads green. */
export const STRONG_MATCH = 85;

const MAX_CANDIDATES = 5;
const OVERLAP_CEILING = 85;
const SIMILARITY_CEILING = 90;
const SIZE_MISMATCH_CEILING = 40;
const SIZE_AGREES = 18;
const BRAND_AGREES = 8;
const VARIANT_AGREES = 10;

export type CatalogueEntry = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  market: string | null;
  packSize: number | null;
  unit: string;
};

export type MatchableLine = { description: string; sku: string | null };
export type Candidate = { productId: string; score: number };
export type Idf = (token: string) => number;

/**
 * Close to `sku.ts`'s `normalise()` but deliberately not it, in two ways that
 * matter for the codes customers actually print:
 *
 * - A period is a separator, not a deletion. `sku.ts` strips "." so that
 *   Goat's becomes goats; applied to ZENSC-R.JELLY2LT that yields
 *   "rjelly2lt" and the distinctive token "jelly" is lost.
 * - A letter/digit boundary splits, so JELLY2LT gives jelly, 2, lt.
 */
const normaliseText = (value: string) =>
  value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const tokenise = (value: string): string[] =>
  normaliseText(value).split(" ").filter(Boolean);

/** The code with every separator removed: the 96 tier compares these. */
const bareSku = (value: string) => normaliseSku(value).replace(/[^A-Z0-9]/g, "");

// LT before L, ML before M-anything, KG before G: alternation is ordered.
// The trailing guard stops "GM" (Goat's Milk) reading as grams.
const SIZE_PATTERN = /(\d+(?:\.\d+)?)\s*(ML|LT|L|KG|G)(?![A-Z])/g;

/** "2.1L" → 2100, "500ML" → 500. Litres and kilograms become ml and g. */
export function parseSize(value: string): number | null {
  for (const match of value.toUpperCase().matchAll(SIZE_PATTERN)) {
    const amount = Number(match[1]);
    const unit = match[2];
    const base = unit === "L" || unit === "LT" || unit === "KG" ? amount * 1000 : amount;
    if (base > 0 && base <= 25000) return base;
  }
  return null;
}

/**
 * The size segment of a generated code — ZEN-SC-2100-GM-VN → 2100 — for
 * products whose name does not print one. The range guard is what stops a
 * code like "KE218441 68216" contributing a nonsense size and earning a
 * false mismatch penalty against everything.
 */
const SKU_SIZE_SEGMENT = /(?:^|[^0-9A-Z])(\d{3,5})(?:[^0-9A-Z]|$)/;

function skuSize(sku: string): number | null {
  const match = normaliseSku(sku).match(SKU_SIZE_SEGMENT);
  if (!match) return null;
  const value = Number(match[1]);
  return value >= 30 && value <= 25000 ? value : null;
}

const entrySize = (entry: CatalogueEntry) => parseSize(entry.name) ?? skuSize(entry.sku);

const lineSize = (line: MatchableLine) =>
  parseSize(line.description) ??
  (line.sku ? (parseSize(line.sku) ?? skuSize(line.sku)) : null);

/**
 * The words a product is known by. The code is deliberately absent: it is
 * handled conclusively by the identity branch, and its segments (gm, vn)
 * would otherwise inflate the union and depress every description-only line.
 */
const entryTokens = (entry: CatalogueEntry) =>
  tokenise([entry.name, entry.brand ?? "", entry.variant ?? ""].join(" "));

/**
 * Inverse document frequency over the catalogue.
 *
 * Production holds 309 products and most of their names open with the same
 * words. A plain overlap score gives "ZEN GARDEN SHOWER CREAM 2.1L GOAT'S
 * MILK" a strong match against every shower cream, because four of its six
 * tokens are shared by two hundred rows. Weighting by log(N / rows holding
 * the token) makes CHAMOMILE count for far more than ZEN — and makes a token
 * every product shares count for exactly nothing.
 *
 * Built once per document, never once per line.
 */
export function buildIdf(catalogue: CatalogueEntry[]): Idf {
  const docs = Math.max(catalogue.length, 1);
  const counts = new Map<string, number>();
  for (const entry of catalogue) {
    for (const token of new Set(entryTokens(entry))) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  // A token no product uses is maximally distinctive, not unweighted.
  const unknown = Math.log(docs + 1);
  return (token) => {
    const seen = counts.get(token);
    return seen === undefined ? unknown : Math.log(docs / seen);
  };
}

/**
 * How strongly one line points at one product, 0–100.
 *
 * Two branches, and which one applies is decided first. The identity branch
 * is conclusive and takes no adjustment. The similarity branch is clamped to
 * 90, so a wording match can never reach the 92 an exact name earns — a
 * suggestion cannot impersonate the Phase 11 exact rule however many tokens
 * happen to line up.
 */
export function scoreLine(
  line: MatchableLine,
  entry: CatalogueEntry,
  idf: Idf,
): number {
  const lineSku = line.sku ? normaliseSku(line.sku) : "";
  if (lineSku) {
    if (lineSku === normaliseSku(entry.sku)) return 100;
    const bare = bareSku(lineSku);
    if (bare && bare === bareSku(entry.sku)) return 96;
  }
  const description = normaliseText(line.description);
  if (description && description === normaliseText(entry.name)) return 92;

  const text = `${line.sku ?? ""} ${line.description}`;
  const lineTokens = new Set(tokenise(text));
  const productTokens = new Set(entryTokens(entry));
  if (lineTokens.size === 0 || productTokens.size === 0) return 0;

  // Weighted Jaccard, not weighted recall: a distinctive word the line has
  // and the product lacks is evidence against, exactly as a missing one is.
  let intersection = 0;
  let union = 0;
  for (const token of new Set([...lineTokens, ...productTokens])) {
    const weight = idf(token);
    union += weight;
    if (lineTokens.has(token) && productTokens.has(token)) intersection += weight;
  }
  let score = union === 0 ? 0 : (intersection / union) * OVERLAP_CEILING;

  // Additive rather than gating: a document that omits the brand is common
  // and must not be penalised for it.
  const haystack = ` ${normaliseText(text)} `;
  if (entry.brand && haystack.includes(` ${normaliseText(entry.brand)} `)) {
    score += BRAND_AGREES;
  }
  if (entry.variant && haystack.includes(` ${normaliseText(entry.variant)} `)) {
    score += VARIANT_AGREES;
  }

  // A size disagreement is the strongest evidence in the document that two
  // lines are different products, and it must outrank any amount of wording
  // overlap: 2.1L and 500ML share every word they have.
  const printed = lineSize(line);
  const stocked = entrySize(entry);
  if (printed !== null && stocked !== null) {
    if (printed === stocked) score += SIZE_AGREES;
    else score = Math.min(score, SIZE_MISMATCH_CEILING);
  }

  return Math.max(0, Math.min(SIMILARITY_CEILING, Math.round(score)));
}

/** The top candidates for one line, best first. Nothing auto-selects. */
export function matchLine(
  line: MatchableLine,
  catalogue: CatalogueEntry[],
  idf: Idf,
): Candidate[] {
  if (!line.description.trim() && !line.sku?.trim()) return [];
  return catalogue
    .map((entry) => ({
      productId: entry.id,
      score: scoreLine(line, entry, idf),
      // Ties break on the code so the order is stable and testable.
      sku: normaliseSku(entry.sku),
    }))
    .filter((candidate) => candidate.score >= SUGGEST_MIN)
    .sort((a, b) => b.score - a.score || a.sku.localeCompare(b.sku))
    .slice(0, MAX_CANDIDATES)
    .map(({ productId, score }) => ({ productId, score }));
}
