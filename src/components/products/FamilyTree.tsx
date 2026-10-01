"use client";

import { useRouter } from "next/navigation";
import { TreeView, type TreeNode } from "@/components/arc/tree-view/tree-view";
import { plural } from "@/lib/plural";

export type FamilySibling = {
  id: string;
  name: string;
  sku: string;
  variant: string | null;
  market: string | null;
  active: boolean;
};

/** A market with no name gathers under one node, pinned last, like the catalogue's own "No market". */
const NO_MARKET = "No market";

/**
 * A family's variants as Arc's tree: one branch per market, one leaf per
 * product, opened on the market this product is in. Choosing a leaf opens
 * that product. The current product says so in its own label rather than
 * leaving the reader to find it by colour, and a hidden one says it is hidden.
 */
export function FamilyTree({
  siblings,
  currentId,
}: {
  siblings: FamilySibling[];
  currentId: string;
}) {
  const router = useRouter();
  const markets = new Map<string, FamilySibling[]>();
  for (const sibling of siblings) {
    const key = sibling.market ?? NO_MARKET;
    markets.set(key, [...(markets.get(key) ?? []), sibling]);
  }
  const ordered = [...markets.keys()].sort((a, b) =>
    a === NO_MARKET ? 1 : b === NO_MARKET ? -1 : a.localeCompare(b),
  );
  const nodes: TreeNode[] = ordered.map((market) => ({
    id: `market:${market}`,
    label: `${market} · ${plural(markets.get(market)!.length, "variant")}`,
    children: markets.get(market)!.map((sibling) => ({
      id: sibling.id,
      label: [
        sibling.variant ?? "Standard",
        sibling.sku,
        sibling.id === currentId ? "this product" : null,
        sibling.active ? null : "hidden",
      ]
        .filter(Boolean)
        .join(" · "),
    })),
  }));
  const current = siblings.find((sibling) => sibling.id === currentId);

  return (
    <TreeView
      nodes={nodes}
      defaultExpandedIds={[`market:${current?.market ?? NO_MARKET}`]}
      onSelect={(node) => {
        if (node.id.startsWith("market:") || node.id === currentId) return;
        router.push(`/products/${node.id}`);
      }}
    />
  );
}
