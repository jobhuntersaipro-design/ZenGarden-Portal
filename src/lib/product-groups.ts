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
 * brand-and-name half of the key and its name is the group's title. Market
 * stays in the key either way; pack size does not, since Phase 40 (see
 * `groupKey`). The derived key remains the fallback, so a product placed in
 * no family draws the card it always drew.
 */

import { unitLabel } from "@/lib/cartons";

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
 * The listing a product's own words describe, ignoring any family: brand,
 * the name with its variant suffix off, and the market.
 *
 * Exported because two callers must agree on it — `groupKey` falls back to
 * it for a product nobody has placed, and `resolveListing` (Phase 40) uses
 * it to answer "which listing would this product join". If they disagreed,
 * the form would promise one listing and the write would pick another.
 */
export function derivedKey(
  product: Pick<Groupable, "brand" | "name" | "variant" | "market">,
): string {
  return [product.brand ?? "", groupName(product), product.market ?? ""].join(SEP);
}

/**
 * The key two products must share to be variants of one another: the same
 * family (or the same brand and name where there is none), and the same
 * market.
 *
 * Market is in the key and pack size is not, and the asymmetry is the
 * business's own (Phase 40). The same cream made for Vietnam and for
 * Malaysia carries different artwork and a different SKU, and offering one
 * to the other's buyer would be wrong. The same cream in a 6-carton and a
 * 12-carton is one product bought two ways, and splitting it hid the bigger
 * carton behind a second card nobody found. Pack size became a variant;
 * `variantLabels` prints it where a listing holds more than one.
 */
export function groupKey(product: Groupable): string {
  // A family id cannot collide with a brand + name pair: the pair carries a
  // NUL between its halves and a cuid never does.
  const identity = product.familyId
    ? [product.familyId]
    : [product.brand ?? "", groupName(product)];
  return [...identity, product.market ?? ""].join(SEP);
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
  /** The pack every variant shares, or null where the listing mixes them. */
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

  for (const group of groups.values()) {
    group.variants.sort(byVariant);
    // The pack belongs to the *group* only when every variant agrees. A
    // listing that mixes 6 and 12 has no single pack to caption, and saying
    // one would be false for half its variants — `variantLabels` carries it
    // per variant there instead.
    const packs = new Set(group.variants.map((variant) => variant.packSize));
    group.packSize = packs.size === 1 ? (group.variants[0]?.packSize ?? null) : null;
  }
  return [...groups.values()];
}

/**
 * What each variant is called in the picker.
 *
 * The flavour, and — only where a listing holds more than one pack size —
 * the pack beside it, because that is the other thing the buyer is choosing
 * between (Phase 40). A listing whose variants all ship 6 per carton says
 * "Papaya", not "Papaya · 6 per carton": repeating on every chip what the
 * card already says once is noise.
 *
 * Where two labels still read the same — the Phase 13 importer's collision
 * suffixes put `ZEN-SC-1000-CH` beside `ZEN-SC-1000-CH-2`, identical in
 * name, variant and pack — the SKU is appended so the two are told apart
 * rather than rendering as two identical buttons. That is a data defect
 * showing through honestly, not one being hidden.
 */
export function variantLabels<
  T extends Pick<Groupable, "id" | "sku" | "variant" | "packSize"> & { unit?: string },
>(variants: T[]): Map<string, string> {
  const packs = new Set(variants.map((variant) => variant.packSize));
  const mixedPacks = packs.size > 1;

  const base = (variant: T) => {
    const flavour = variant.variant ?? "Standard";
    return mixedPacks
      ? `${flavour} · ${unitLabel(variant.packSize, variant.unit ?? "carton")}`
      : flavour;
  };

  const seen = new Map<string, number>();
  for (const variant of variants) {
    const label = base(variant);
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }

  const labels = new Map<string, string>();
  for (const variant of variants) {
    const label = base(variant);
    labels.set(variant.id, (seen.get(label) ?? 0) > 1 ? `${label} (${variant.sku})` : label);
  }
  return labels;
}
