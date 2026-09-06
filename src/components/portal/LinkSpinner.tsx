"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/components/portal/Spinner";

/**
 * The ring spinner for a `Link`, shown from the click until the new route's
 * history entry lands. Must be rendered inside the `Link` — that is where
 * `useLinkStatus` reads from. The route's own `loading.tsx` takes over once
 * the navigation commits; this covers the gap before it, which on a slow
 * connection is the gap that reads as "nothing happened".
 */
export function LinkSpinner({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={className} />;
}
