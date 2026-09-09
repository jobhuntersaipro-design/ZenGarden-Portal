"use client";

import { useMemo } from "react";
import type { Dispatch } from "react";
import { Combobox } from "@/components/review/Combobox";
import type { DraftAction } from "@/components/review/draft-reducer";
import {
  matchLine,
  STRONG_MATCH,
  type CatalogueEntry,
  type Idf,
} from "@/lib/extraction/match-products";
import type { DraftLineItem } from "@/lib/validation/purchase-orders";

const NEW = "__new__";
const NONE = "__none__";

/** "ZEN-SC-2100-GM-VN · Goat's Milk · Vietnam · 6/carton" */
function describe(entry: CatalogueEntry): string {
  return [
    entry.sku,
    entry.name,
    entry.variant,
    // Market is the thing that separates two otherwise identical rows: the
    // catalogue holds one product per variant x market, and a document almost
    // never prints which. It is shown for exactly that reason, and never
    // scored — scoring it would be noise on every line.
    entry.market,
    entry.packSize ? `${entry.packSize}/${entry.unit}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ProductMatchPicker({
  line,
  index,
  catalogue,
  idf,
  dispatch,
}: {
  line: DraftLineItem;
  index: number;
  catalogue: CatalogueEntry[];
  idf: Idf;
  dispatch: Dispatch<DraftAction>;
}) {
  // Re-ranks as the reviewer corrects the printed code or the description.
  const candidates = useMemo(
    () => matchLine({ description: line.description, sku: line.sku }, catalogue, idf),
    [line.description, line.sku, catalogue, idf],
  );

  const byId = useMemo(
    () => new Map(catalogue.map((entry) => [entry.id, entry])),
    [catalogue],
  );

  // Candidates first so `Combobox`'s unfiltered slice(0, 50) shows the ranked
  // ones rather than fifty alphabetical products. The label carries the code,
  // the name and the market on purpose: it is what the query filters on, so
  // typing "vietnam" or a code both work.
  const options = useMemo(() => {
    const ranked = candidates
      .map((candidate) => byId.get(candidate.productId))
      .filter((entry): entry is CatalogueEntry => Boolean(entry));
    const rankedIds = new Set(ranked.map((entry) => entry.id));
    const rest = catalogue.filter((entry) => !rankedIds.has(entry.id));
    return [...ranked, ...rest].map((entry) => ({
      id: entry.id,
      label: describe(entry),
    }));
  }, [candidates, byId, catalogue]);

  const top = candidates[0];
  const selected =
    line.productDecision === "linked"
      ? (line.productId ?? null)
      : line.productDecision === "new"
        ? NEW
        : line.productDecision === "none"
          ? NONE
          : null;

  return (
    <div className="flex flex-col gap-xxs">
      <Combobox
        ariaLabel={`Product, line ${index + 1}`}
        value={selected}
        placeholder="Choose a product"
        options={options}
        pinned={[
          { id: NEW, label: "Create new product from this line" },
          { id: NONE, label: "Not a product" },
        ]}
        onSelect={(option) =>
          dispatch({
            type: "decision",
            index,
            decision:
              option.id === NEW ? "new" : option.id === NONE ? "none" : "linked",
            productId:
              option.id === NEW || option.id === NONE ? null : option.id,
          })
        }
      />
      {line.productDecision === "unset" ? (
        <MatchHint score={top?.score ?? null} />
      ) : null}
    </div>
  );
}

/**
 * The machine's opinion, shown only while nobody has decided. Once a person
 * has, the score is history and a chip beside their choice only invites
 * second-guessing.
 *
 * The amber is `brand-amber`, the same one `Field` uses for a low-confidence
 * extraction — the status palette has no `accent-amber` and this screen should
 * not grow a second vocabulary for "worth a look".
 */
function MatchHint({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-[length:var(--text-caption)] text-ink-tertiary">
        No match — choose or create
      </span>
    );
  }
  const strong = score >= STRONG_MATCH;
  return (
    <span
      className={`text-[length:var(--text-caption)] ${
        strong ? "text-accent-green" : "text-brand-amber"
      }`}
    >
      {`Suggested · ${score}% match`}
    </span>
  );
}
