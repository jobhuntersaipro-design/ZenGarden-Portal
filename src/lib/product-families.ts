/**
 * Proposing families for products that have none (Phase 36).
 *
 * The catalogue's 308 imported products carry a brand, a name that prints the
 * line and usually a size, a variant and a market. A family is the product
 * across markets, so the grouping key is brand + line + size and **not**
 * market — the same cream for Vietnam and for Malaysia is one family.
 *
 * Grouping by the name's line text is honest about what the sheet says and
 * wrong about what the business means: the sheet writes `ZEN 2.1L`,
 * `ZEN 2.1L NORMAL/DIY` and `2.1L ZEN SIGNATURE` for what is, to a buyer,
 * one shower cream — while `ZEN 1L` and `ZEN 1L SHOWER SCRUB` share brand,
 * category and size and are two products. No rule tells those cases apart,
 * so this module never resolves a collision. It proposes, reports, and leaves
 * the code blank wherever two groups would take the same one; a person fills
 * it in — the same code on both groups to merge them, a qualifier on one to
 * split them — and `--apply` refuses to run while any is still blank.
 *
 * Pure: no Prisma, no I/O. The script around it does the reading and writing.
 */

import { groupName } from "@/lib/product-groups";
import { generateFamilyCode, sizeInName } from "@/lib/sku";
import type { FamilyOption } from "@/lib/queries/product-families";
import type { ProductFamilyInput } from "@/lib/validation/product-families";

/** What the create form and the edit drawer collect for a family made inline. */
export type FamilyDraft = { name: string; size: string; qualifier: string };

/**
 * A family described on a product's own form: brand and category come from
 * the product, the code from those plus the size and the qualifier typed.
 * Recomputed at submit rather than stored, so changing the product's brand
 * after opening the disclosure cannot leave the family with the old one.
 */
export function familyFromDraft(
  draft: FamilyDraft,
  product: { brand: string | null; category: string },
): ProductFamilyInput {
  const size = draft.size.trim() || null;
  return {
    code: generateFamilyCode({
      brand: product.brand,
      category: product.category,
      size,
      qualifier: draft.qualifier.trim() || null,
    }),
    name: draft.name.trim(),
    brand: product.brand,
    category: product.category,
    size,
  };
}

/**
 * The family a drafted code would collide with, if any — knowable the moment
 * a code is typed, since a code is built from brand + category + size alone
 * (Phase 36) and a different family *name* cannot disambiguate it. Surfacing
 * this before submit, rather than only from the server's own rejection, is
 * what Phase 39 added: the reader could otherwise type a fresh name over an
 * existing family's exact code and only learn why at the end.
 *
 * Case-insensitive because the database's own uniqueness is not: `code` is
 * always generated upper-case, but comparing loosely here means a family
 * created any other way still gets caught before the server's own P2002
 * rejection, rather than only sometimes.
 */
export function findFamilyCodeCollision(
  code: string,
  families: FamilyOption[],
): FamilyOption | null {
  const target = code.trim().toLowerCase();
  if (!target) return null;
  return families.find((family) => family.code.toLowerCase() === target) ?? null;
}

export type FamilyCandidate = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  variant: string | null;
  category: string;
  market: string | null;
  /** Created by the purchase-order intake and not yet looked at: skipped. */
  needsReview: boolean;
  familyId: string | null;
};

export type ProposedGroup = {
  /** The brand + line + size the group was formed on. */
  key: string;
  /** What `generateFamilyCode` yields for the group. */
  proposedCode: string;
  /**
   * The code to apply. Equal to `proposedCode` when no other group proposes
   * it; `null` where two or more do, for a person to fill in.
   */
  code: string | null;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  /** The line text as the name prints it, for the person reviewing. */
  line: string;
  markets: string[];
  products: { id: string; sku: string; name: string; market: string | null }[];
};

export type FamilyProposal = {
  groups: ProposedGroup[];
  /** Left alone, with the reason. */
  skipped: { id: string; sku: string; name: string; reason: string }[];
};

const SEP = "\u0000";

const lower = (value: string | null) => value?.trim().toLowerCase() ?? "";

/**
 * Groups products by brand + line + size and proposes a code per group. The
 * order of groups follows first appearance, so a caller that sorted its
 * input (by name, say) gets a report in that order.
 */
export function proposeFamilies(products: FamilyCandidate[]): FamilyProposal {
  const groups = new Map<string, ProposedGroup>();
  const skipped: FamilyProposal["skipped"] = [];

  for (const product of products) {
    if (product.familyId) {
      skipped.push({ ...pick(product), reason: "already in a family" });
      continue;
    }
    if (product.needsReview) {
      skipped.push({ ...pick(product), reason: "needs review" });
      continue;
    }

    const line = groupName(product);
    const size = sizeInName(line);
    const key = [lower(product.brand), line.toLowerCase(), size ?? ""].join(SEP);

    const existing = groups.get(key);
    if (existing) {
      existing.products.push(member(product));
      if (product.market && !existing.markets.includes(product.market)) {
        existing.markets.push(product.market);
      }
      continue;
    }

    const proposedCode = generateFamilyCode({
      brand: product.brand,
      category: product.category,
      size,
    });
    groups.set(key, {
      key,
      proposedCode,
      code: proposedCode,
      name: line,
      brand: product.brand,
      category: product.category,
      size,
      line,
      markets: product.market ? [product.market] : [],
      products: [member(product)],
    });
  }

  // Blank the code wherever more than one group proposes it.
  const byCode = new Map<string, ProposedGroup[]>();
  for (const group of groups.values()) {
    byCode.set(group.proposedCode, [...(byCode.get(group.proposedCode) ?? []), group]);
  }
  for (const contenders of byCode.values()) {
    if (contenders.length > 1) for (const group of contenders) group.code = null;
  }

  return { groups: [...groups.values()], skipped };
}

const pick = (product: FamilyCandidate) => ({
  id: product.id,
  sku: product.sku,
  name: product.name,
});

const member = (product: FamilyCandidate) => ({
  ...pick(product),
  market: product.market,
});

/* ------------------------------------------------------------------------ */
/* The catalog by family                                                     */
/* ------------------------------------------------------------------------ */

/** The `?family=` value that means "products in no family". */
export const NO_FAMILY = "none";

export type FamilyRow = {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string;
  size: string | null;
  variants: number;
  markets: number;
  active: number;
  /** Products in the family carrying at least one attention flag. */
  toFix: number;
  units: number;
  revenue: number;
  orders: number;
  buyers: number;
};

export const FAMILY_SORT_KEYS = [
  "name",
  "brand",
  "category",
  "size",
  "variants",
  "units",
  "revenue",
  "buyers",
  "status",
] as const;

export type FamilySortKey = (typeof FAMILY_SORT_KEYS)[number];

type FamilyMember = {
  id: string;
  market: string | null;
  active: boolean;
  flags: readonly string[];
  family: { id: string; code: string; name: string; brand: string | null; category: string; size: string | null } | null;
};

type SaleRow = { purchaseOrderId: string; buyerId: string; quantity: number; amount: number };

/**
 * One row per family from the products already fetched for the catalog, with
 * the family's twelve-month figures summed from the same sale rows the
 * product rows use — so a family's revenue is exactly its variants' revenue
 * added up, and distinct orders and buyers are counted across the family
 * rather than summed per variant (two variants on one PO is one order).
 *
 * Products in no family become one last row, `NO_FAMILY`, so they are
 * countable and reachable from the family view rather than invisible in it.
 */
export function groupFamilies<P extends FamilyMember>(
  products: P[],
  rowsByProduct: Map<string, SaleRow[]>,
): FamilyRow[] {
  const groups = new Map<string, { row: FamilyRow; orders: Set<string>; buyers: Set<string>; markets: Set<string> }>();

  for (const product of products) {
    const key = product.family?.id ?? NO_FAMILY;
    let group = groups.get(key);
    if (!group) {
      group = {
        row: {
          id: key,
          code: product.family?.code ?? "—",
          name: product.family?.name ?? "No family",
          brand: product.family?.brand ?? null,
          category: product.family?.category ?? "—",
          size: product.family?.size ?? null,
          variants: 0,
          markets: 0,
          active: 0,
          toFix: 0,
          units: 0,
          revenue: 0,
          orders: 0,
          buyers: 0,
        },
        orders: new Set(),
        buyers: new Set(),
        markets: new Set(),
      };
      groups.set(key, group);
    }
    group.row.variants += 1;
    if (product.active) group.row.active += 1;
    if (product.flags.length > 0) group.row.toFix += 1;
    if (product.market) group.markets.add(product.market);
    for (const sale of rowsByProduct.get(product.id) ?? []) {
      group.row.units += sale.quantity;
      group.row.revenue += sale.amount;
      group.orders.add(sale.purchaseOrderId);
      group.buyers.add(sale.buyerId);
    }
  }

  const rows = [...groups.values()].map((group) => ({
    ...group.row,
    // Cents, for the same reason `summarise` rounds: two sums of the same
    // figures in a different order must print identically.
    revenue: Math.round(group.row.revenue * 100) / 100,
    markets: group.markets.size,
    orders: group.orders.size,
    buyers: group.buyers.size,
  }));
  // The unplaced row last, whatever the sort — it is a remainder, not a family.
  return rows.sort((a, b) => Number(a.id === NO_FAMILY) - Number(b.id === NO_FAMILY));
}

/** Filtering, searching and sorting the family rows, after the stats exist. */
export function selectFamilies(
  families: FamilyRow[],
  {
    q,
    brand,
    category,
    sort,
  }: {
    q?: string;
    brand?: string;
    category?: string;
    sort: { key: FamilySortKey; dir: "asc" | "desc" };
  },
): FamilyRow[] {
  const needle = q?.trim().toLowerCase();
  const filtered = families.filter((family) => {
    if (brand && family.brand !== brand) return false;
    if (category && family.category !== category) return false;
    if (
      needle &&
      ![family.name, family.code, family.brand]
        .filter((v): v is string => Boolean(v))
        .some((v) => v.toLowerCase().includes(needle))
    ) {
      return false;
    }
    return true;
  });

  const value = (family: FamilyRow): number | string => {
    switch (sort.key) {
      case "name":
        return family.name.toLowerCase();
      case "brand":
        return family.brand?.toLowerCase() ?? "";
      case "category":
        return family.category.toLowerCase();
      case "size":
        return family.size?.toLowerCase() ?? "";
      case "variants":
        return family.variants;
      case "units":
        return family.units;
      case "revenue":
        return family.revenue;
      case "buyers":
        return family.buyers;
      case "status":
        return family.toFix;
    }
  };

  const unplaced = filtered.filter((f) => f.id === NO_FAMILY);
  const sorted = filtered
    .filter((f) => f.id !== NO_FAMILY)
    .sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right)
          : Number(left) - Number(right);
      return sort.dir === "asc" ? comparison : -comparison;
    });
  return [...sorted, ...unplaced];
}

/** The groups still carrying no code, keyed by the code they collided on. */
export function collisions(proposal: FamilyProposal): Map<string, ProposedGroup[]> {
  const result = new Map<string, ProposedGroup[]>();
  for (const group of proposal.groups) {
    if (group.code !== null) continue;
    result.set(group.proposedCode, [...(result.get(group.proposedCode) ?? []), group]);
  }
  return result;
}

/**
 * What a person reads before editing the proposal: every collision with
 * enough of each side to decide, the sizeless groups, what was skipped, and
 * the counts.
 */
export function familyReport(proposal: FamilyProposal): string {
  const lines: string[] = [];
  const products = proposal.groups.reduce((n, g) => n + g.products.length, 0);
  const codes = new Set(proposal.groups.map((g) => g.proposedCode)).size;
  const collided = collisions(proposal);
  const sizeless = proposal.groups.filter((g) => g.size === null);

  if (collided.size > 0) {
    lines.push(`Collisions — ${collided.size} codes proposed by more than one group.`);
    lines.push("Fill in \"code\" on each: the same code merges them, a qualifier splits them.");
    for (const [code, groups] of collided) {
      lines.push(`  ${code}`);
      for (const group of groups) {
        const markets = group.markets.length ? group.markets.join(", ") : "no market";
        lines.push(
          `    ${group.line}  · ${group.products.length} products · ${markets}`,
        );
        lines.push(`      e.g. ${group.products.slice(0, 3).map((p) => p.sku).join(", ")}`);
      }
    }
    lines.push("");
  }

  if (sizeless.length > 0) {
    lines.push(`Sizeless — ${sizeless.length} groups whose name prints no size (kept, check the code).`);
    for (const group of sizeless) {
      lines.push(`  ${group.code ?? `(blank, was ${group.proposedCode})`}  ${group.line} · ${group.products.length} products`);
    }
    lines.push("");
  }

  if (proposal.skipped.length > 0) {
    lines.push(`Skipped — ${proposal.skipped.length} products left alone.`);
    for (const item of proposal.skipped) {
      lines.push(`  ${item.sku}  ${item.name} · ${item.reason}`);
    }
    lines.push("");
  }

  lines.push(
    `${products} products → ${proposal.groups.length} groups → ${codes} codes, ` +
      `${collided.size} collisions, ${sizeless.length} sizeless, ${proposal.skipped.length} skipped.`,
  );
  return lines.join("\n");
}
