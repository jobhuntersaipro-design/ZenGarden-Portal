"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { lookupListing } from "@/actions/listings";
import type { ListingMatch } from "@/lib/listings";

/**
 * What happens to this product when it is saved (Phase 40).
 *
 * Before this, a reader could enter a second flavour of a product that was
 * already on the shop and be told nothing: the row landed in no family and
 * the card it joined was a coincidence of names. The line says which
 * listing is being joined, and the write then does exactly that — the same
 * resolver runs in both places.
 *
 * Debounced, because it runs as three fields are typed. 400 ms matches the
 * review screen's own draft save, which is the other place in this app that
 * calls a Server Action from a keystroke.
 */
const DEBOUNCE_MS = 400;

const caption = "text-[length:var(--text-caption)]";

export function ListingNotice({
  brand,
  name,
  variant,
  market,
  excludeId,
  chosenFamilyName = null,
  leavingFamilyName = null,
}: {
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  excludeId?: string;
  /** Set while the reader has chosen a family themselves; the notice then
   *  says which one will be used instead of looking one up. */
  chosenFamilyName?: string | null;
  /**
   * Set while the reader has chosen "No family" on a product that is in one
   * — the drawer's detach. Without it this line fell through to the lookup
   * and printed "Joins the existing listing X", naming the very family the
   * save was about to take the product out of.
   */
  leavingFamilyName?: string | null;
}) {
  const [match, setMatch] = useState<ListingMatch | null>(null);

  useEffect(() => {
    // Nothing to look up until the product has a name; brand and market are
    // allowed to be null, and a listing keyed on "no brand, no market" is a
    // real one. The empty-name case is handled at render time below rather
    // than by calling setMatch here, so the effect body never sets state
    // synchronously on its own first run.
    if (!name.trim()) return;
    let live = true;
    const timer = setTimeout(async () => {
      const result = await lookupListing({ brand, name, variant, market, excludeId });
      if (live && result.success) setMatch(result.data);
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [brand, name, variant, market, excludeId]);

  // Leaving is checked before joining: a detach is also a state in which no
  // family is chosen, and the lookup below would otherwise describe the one
  // being left as the one being joined.
  if (leavingFamilyName) {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Leaves <strong className="font-semibold text-ink">{leavingFamilyName}</strong> —
        it goes back to being grouped by its name.
      </p>
    );
  }

  // A family the reader picked themselves overrides whatever the lookup
  // found; saying otherwise would contradict the control right below.
  if (chosenFamilyName) {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins <strong className="font-semibold text-ink">{chosenFamilyName}</strong>, the
        family chosen below.
      </p>
    );
  }

  // No name means no lookup ran (or one is stale from before the field was
  // cleared) — either way there is nothing true to say yet.
  if (!name.trim() || !match) return null;

  if (match.kind === "ambiguous") {
    return (
      <p className={`${caption} text-accent-red`}>
        This matches {match.families.length} listings —{" "}
        {match.families.map((family) => family.name).join(" and ")}. Choose a family
        below.
      </p>
    );
  }

  if (match.kind === "family") {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins the existing listing{" "}
        <Link
          href={`/admin/catalogue/families/${match.familyId}`}
          className="font-semibold text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {match.familyName}
        </Link>{" "}
        ({match.members} {match.members === 1 ? "variant" : "variants"}).
      </p>
    );
  }

  if (match.kind === "derived") {
    return (
      <p className={`${caption} text-ink-secondary`}>
        Joins <strong className="font-semibold text-ink">{match.title}</strong> —{" "}
        {match.memberIds.length}{" "}
        {match.memberIds.length === 1 ? "product" : "products"} in no family yet.
        Saving puts all of them in one family.
      </p>
    );
  }

  return <p className={`${caption} text-ink-tertiary`}>This will be a new listing.</p>;
}
