"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useNavProgress } from "@/components/portal/NavProgress";

/**
 * The single way this app writes the URL.
 *
 * `router.replace` on its own gives no feedback: the server re-renders the
 * route and the old screen simply sits there until it does. Wrapping it in a
 * transition makes that wait observable — `pending` drives the top progress
 * bar and the "Updating…" hints, and React keeps the previous content
 * interactive instead of blanking it (brief G1).
 *
 * `scroll: false` on every write, because a filter, sort or range change is an
 * update to the page you are already reading, not a new one.
 */
export function useUrlNavigation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useNavProgress(pending);

  const replace = useCallback(
    (href: string) => {
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router],
  );

  const push = useCallback(
    (href: string) => {
      startTransition(() => router.push(href));
    },
    [router],
  );

  return { pending, replace, push };
}
