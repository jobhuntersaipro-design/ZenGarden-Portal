import { derivedKey, groupName } from "@/lib/product-groups";

/**
 * Which listing a product belongs to (Phase 40).
 *
 * A listing is a `ProductFamily` in one market. Until somebody curates one,
 * the shop derives it from brand + name + market, so "which listing does
 * this product join" has three possible answers and one refusal:
 *
 * - a **family** one of its future siblings already carries;
 * - a **derived** group of products nobody has placed in a family yet, which
 *   the write turns into a real family so the listing stops being a
 *   coincidence of names;
 * - **new**, when nothing matches;
 * - **ambiguous**, when the matching products carry more than one family —
 *   possible after curation, and not a thing to guess at. The form asks and
 *   the write refuses.
 *
 * Pure: the caller does the reading. The same function runs on the form, to
 * tell the reader what will happen, and inside the write, to make it happen
 * — which is what stops the message and the outcome disagreeing.
 */
export type ListingCandidate = {
  id: string;
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  familyId: string | null;
  familyName: string | null;
};

export type ListingMatch =
  | { kind: "family"; familyId: string; familyName: string; members: number }
  | { kind: "derived"; title: string; memberIds: string[] }
  | { kind: "ambiguous"; families: { id: string; name: string }[] }
  | { kind: "new" };

export function resolveListing(
  product: { brand: string | null; name: string; variant: string | null; market: string | null },
  candidates: ListingCandidate[],
  excludeId?: string,
): ListingMatch {
  const key = derivedKey(product);
  // The product's own row is not its own sibling: the edit drawer reads the
  // whole catalogue, including the row being edited.
  const members = candidates.filter(
    (candidate) => candidate.id !== excludeId && derivedKey(candidate) === key,
  );
  if (members.length === 0) return { kind: "new" };

  const families = new Map<string, string>();
  for (const member of members) {
    if (member.familyId) families.set(member.familyId, member.familyName ?? "");
  }

  if (families.size > 1) {
    return {
      kind: "ambiguous",
      families: [...families].map(([id, name]) => ({ id, name })),
    };
  }

  const [entry] = [...families];
  if (entry) {
    const [familyId, familyName] = entry;
    return {
      kind: "family",
      familyId,
      familyName,
      members: members.filter((member) => member.familyId === familyId).length,
    };
  }

  return {
    kind: "derived",
    title: groupName(product),
    memberIds: members.map((member) => member.id),
  };
}
