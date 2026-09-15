/**
 * Which products are the same thing in a different flavour.
 *
 * The customer sells one shower cream in eight variants, and until Phase 31
 * the shop drew eight cards for it. A buyer looking for "ZEN 2.1L" met
 * Avocado, Carrot, Goat's Milk, Green Tea, Lavender, Oat Milk, Papaya and
 * Royal Jelly as eight unrelated products.
 *
 * **Nothing here reads or writes the database, and no column was added.** A
 * group is derived from what a product already carries: its brand, its pack
 * size, its market and its name. Each variant keeps its own row, its own SKU,
 * its own price and its own purchase-order matching, so ops and the extraction
 * path are untouched.
 *
 * The one wrinkle is that the catalogue holds two naming conventions:
 *
 * - typed in ops, the variant stays out of the name — `Zen Garden Shower
 *   Cream 2.1L` with `variant: "GOAT'S MILK"`;
 * - written by the Phase 13 importer, the variant is appended to it —
 *   `ZEN 2.1L NORMAL/DIY — Papaya` with `variant: "Papaya"`.
 *
 * `groupName` reconciles them by removing a trailing `" — {variant}"` **only
 * when it really is this product's own variant**, matched case-insensitively.
 * A name that merely contains a dash keeps every character, so
 * `H/WASH 500ML (7/LAYER X 8)` is never truncated.
 *
 * Since Phase 36 a product may carry a **family** — the product across every
 * market, assigned in ops — and where it does, the family stands in for the
 * brand-and-name half of the key and its name is the group's title. Pack
 * size and market stay in the key either way (see `groupKey`). The derived
 * key remains the fallback, so a product placed in no family draws the card
 * it always drew.
 */

/** The fields a group is derived from. Any product row satisfies it. */
export type Groupable = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  packSize: number | null;
  market: string | null;
  /**
   * Optional rather than nullable so a caller that has not selected it still
   * groups — on the derived key. A caller that wants families to agree with
   * ops selects both of these.
   */
  familyId?: string | null;
  familyName?: string | null;
};

/** Separator for the composite key: a NUL cannot occur in any of the parts. */
const SEP = "\u0000";

const SUFFIX = " — ";

/**
 * The product's name with its own variant suffix removed — the title a group
 * is shown under, and the title of a lone product that has no siblings.
 */
export function groupName(product: Pick<Groupable, "name" | "variant">): string {
  const name = product.name.trim();
  const variant = product.variant?.trim();
  if (!variant) return name;

  const suffix = `${SUFFIX}${variant}`;
  if (name.length <= suffix.length) return name;
  const tail = name.slice(-suffix.length);
  // Case-insensitive, because the importer title-cases a variant the sheet
  // shouts ("GOAT'S MILK" → "Goat's Milk") and either may reach the name.
  if (tail.toLocaleLowerCase() !== suffix.toLocaleLowerCase()) return name;

  const stripped = name.slice(0, -suffix.length).trim();
  // Never strip a name down to nothing: a product called exactly "— Papaya"
  // keeps what it has rather than becoming an untitled card.
  return stripped === "" ? name : stripped;
}

/**
 * The key two products must share to be variants of one another: same brand,
 * same group name, same pack size, same market.
 *
 * Pack size and market are in the key deliberately. The same cream at 1L and
 * 2.1L is a different thing to order, and the same cream destined for Vietnam
 * carries different artwork and a different SKU — the development catalogue
 * holds `2.1L ZEN SIGNATURE` under both `Super Indo` and `Lotus`, and
 * collapsing those would offer a buyer a variant their market does not stock.
 */
export function groupKey(product: Groupable): string {
  // A family id cannot collide with a brand + name pair: the pair carries a
  // NUL between its halves and a cuid never does.
  const identity = product.familyId
    ? [product.familyId]
    : [product.brand ?? "", groupName(product)];
  return [...identity, product.packSize ?? "", product.market ?? ""].join(SEP);
}

/** The title a group is shown under: its family's name where it has one. */
function groupTitle(product: Groupable): string {
  return (product.familyId && product.familyName) || groupName(product);
}

export type ProductGroup<T extends Groupable> = {
  key: string;
  /** The shared title — the name with no variant on the end. */
  name: string;
  brand: string | null;
  packSize: number | null;
  market: string | null;
  /** At least one. A group of exactly one is an ordinary product. */
  variants: T[];
};

/** Sorts variants by their label, unnamed ones last, then by SKU for stability. */
function byVariant(a: Groupable, b: Groupable): number {
  if (a.variant && b.variant) {
    return a.variant.localeCompare(b.variant) || a.sku.localeCompare(b.sku);
  }
  if (a.variant) return -1;
  if (b.variant) return 1;
  return a.sku.localeCompare(b.sku);
}

/**
 * Groups products, keeping the order in which each group first appears so a
 * caller that sorted its input keeps that ordering.
 */
export function groupProducts<T extends Groupable>(products: T[]): ProductGroup<T>[] {
  const groups = new Map<string, ProductGroup<T>>();

  for (const product of products) {
    const key = groupKey(product);
    const existing = groups.get(key);
    if (existing) {
      existing.variants.push(product);
      continue;
    }
    groups.set(key, {
      key,
      name: groupTitle(product),
      brand: product.brand,
      packSize: product.packSize,
      market: product.market,
      variants: [product],
    });
  }

  for (const group of groups.values()) group.variants.sort(byVariant);
  return [...groups.values()];
}

/**
 * What each variant is called in the picker.
 *
 * Normally the variant itself. Where a group holds two rows carrying the same
 * variant — the Phase 13 importer's collision suffixes put `ZEN-SC-1000-CH`
 * beside `ZEN-SC-1000-CH-2`, identical in name, variant and price — the SKU
 * is appended so the two chips are told apart rather than rendering as two
 * identical buttons. That is a data defect showing through honestly, not one
 * being hidden.
 */
export function variantLabels<T extends Pick<Groupable, "id" | "sku" | "variant">>(
  variants: T[],
): Map<string, string> {
  const seen = new Map<string, number>();
  for (const variant of variants) {
    const label = variant.variant ?? "Standard";
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  const labels = new Map<string, string>();
  for (const variant of variants) {
    const label = variant.variant ?? "Standard";
    labels.set(variant.id, (seen.get(label) ?? 0) > 1 ? `${label} (${variant.sku})` : label);
  }
  return labels;
}
