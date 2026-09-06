"use client";

import { useState } from "react";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * A choice that shows itself the moment it is made.
 *
 * Chips, presets and segmented controls read their selected value from the
 * URL, and the URL only changes when the server has answered — so a click
 * used to leave the control looking untouched for the whole round trip. This
 * holds the clicked value locally for exactly as long as the transition runs:
 * the control renders it as selected at once, `isPending(value)` says which
 * option to put the spinner on, and when the server's value arrives the local
 * one is dropped, so a failed or superseded write cannot leave a stale
 * selection behind.
 *
 * Each call owns its own transition. Two groups in one component — the range
 * presets and the aggregation segment — need two calls, or a click on one
 * would spin the other.
 */
export function usePendingChoice<T>(current: T) {
  const { replace, pending } = useUrlNavigation();
  const [chosen, setChosen] = useState<{ value: T } | null>(null);

  const active = pending && chosen !== null;

  const choose = (value: T, href: string) => {
    setChosen({ value });
    replace(href);
  };

  return {
    /** What the control should show as selected right now. */
    value: active ? chosen.value : current,
    /** True while a choice from this group is in flight. */
    pending: active,
    /** True for the one option that was clicked and is still in flight. */
    isPending: (value: T) => active && Object.is(chosen.value, value),
    choose,
  };
}
