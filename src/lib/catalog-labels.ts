import { CatalogLabelKind } from "@/generated/prisma/enums";

/** The product column each kind of label is written to. */
export const LABEL_FIELD = {
  [CatalogLabelKind.BRAND]: "brand",
  [CatalogLabelKind.VARIANT]: "variant",
  [CatalogLabelKind.MARKET]: "market",
  [CatalogLabelKind.CATEGORY]: "category",
} as const satisfies Record<CatalogLabelKind, "brand" | "variant" | "market" | "category">;

export type LabelField = (typeof LABEL_FIELD)[CatalogLabelKind];

/** The inverse, for the pickers, which are named after the product field. */
export const FIELD_KIND = {
  brand: CatalogLabelKind.BRAND,
  variant: CatalogLabelKind.VARIANT,
  market: CatalogLabelKind.MARKET,
  category: CatalogLabelKind.CATEGORY,
} as const satisfies Record<LabelField, CatalogLabelKind>;

/** Sentence-case nouns, singular and plural, for headings and messages. */
export const LABEL_NOUN: Record<CatalogLabelKind, { one: string; many: string }> = {
  [CatalogLabelKind.BRAND]: { one: "brand", many: "Brands" },
  [CatalogLabelKind.VARIANT]: { one: "variant", many: "Variants" },
  [CatalogLabelKind.MARKET]: { one: "market", many: "Markets" },
  [CatalogLabelKind.CATEGORY]: { one: "category", many: "Categories" },
};

/** The order the sections are read in, which is the order of the pickers. */
export const LABEL_KINDS = [
  CatalogLabelKind.BRAND,
  CatalogLabelKind.VARIANT,
  CatalogLabelKind.MARKET,
  CatalogLabelKind.CATEGORY,
] as const;

/**
 * Values nothing may rename or remove. `resolveProducts` writes
 * "Uncategorised" verbatim when a document gives no category, so a catalogue
 * without it would break the purchase-order intake path at a point where
 * nobody could see why — and a product must have a category, so there would
 * be no value to fall back to.
 */
const PROTECTED: Partial<Record<CatalogLabelKind, string[]>> = {
  [CatalogLabelKind.CATEGORY]: ["Uncategorised"],
};

export const isProtectedLabel = (kind: CatalogLabelKind, value: string) =>
  (PROTECTED[kind] ?? []).some(
    (entry) => entry.toLowerCase() === value.trim().toLowerCase(),
  );

export const PROTECTED_MESSAGE = (value: string) =>
  `“${value}” is used by the purchase-order intake when a document gives no category, so it stays.`;

/** "3 products still use it" — the reason Remove is refused. */
export const inUseMessage = (value: string, products: number) =>
  `${products} ${products === 1 ? "product" : "products"} still ${
    products === 1 ? "uses" : "use"
  } “${value}”. Change ${products === 1 ? "it" : "them"} first, or rename this value instead.`;
