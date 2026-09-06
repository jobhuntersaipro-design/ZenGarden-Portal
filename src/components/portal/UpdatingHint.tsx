"use client";

import { useIsUpdating } from "@/components/portal/NavProgress";

/**
 * "Updating…" beside a summary line while an in-place update is in flight
 * (brief G1, and the microcopy table).
 *
 * The summary is the sentence that claims how many records and how much money
 * the screen is showing. When a filter changes, that claim is stale for as
 * long as the server takes — so it says so, right where the reader is looking,
 * rather than leaving them to notice the numbers move.
 */
export function UpdatingHint() {
  const updating = useIsUpdating();
  if (!updating) return null;

  return (
    <span role="status" className="text-brand-link">
      {" · "}Updating…
    </span>
  );
}
