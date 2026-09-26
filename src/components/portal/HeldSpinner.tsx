"use client";

import { Spinner } from "@/components/portal/Spinner";
import { useHeldFlag } from "@/hooks/useHeldFlag";

/**
 * The button's spinner, held for the loading floor. Only the ring is held:
 * the button's `disabled` and `aria-busy` still follow `pending` exactly, so
 * a finished action is never kept from being pressed again.
 */
export function HeldSpinner({ pending }: { pending: boolean }) {
  return useHeldFlag(pending) ? <Spinner /> : null;
}
