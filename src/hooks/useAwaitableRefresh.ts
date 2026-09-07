"use client";

import { useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

/** A refresh that hangs must not hold a spinner open for ever. */
const GIVE_UP_MS = 8000;

/**
 * `router.refresh()` returns `undefined`, so a caller cannot tell when the
 * server-rendered shell has actually caught up. Wrapping it in a transition
 * makes the wait observable — `isPending` is true until the new RSC payload is
 * applied — and this turns that into a promise the caller can await.
 *
 * `/settings` needs it because the sidebar reads the *row*: without awaiting,
 * "Picture updated" appears while the shell still shows the old picture.
 *
 * The timeout is deliberate. If the transition somehow never settles, the
 * promise resolves anyway rather than stranding whatever spinner is waiting on
 * it — the failure this app already met once, when an unguarded promise left
 * every avatar disabled with nothing on screen to say why.
 */
export function useAwaitableRefresh(): () => Promise<void> {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const waiting = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (pending) return;
    const settled = waiting.current;
    waiting.current = [];
    for (const resolve of settled) resolve();
  }, [pending]);

  return useCallback(
    () =>
      new Promise<void>((resolve) => {
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        const timer = setTimeout(settle, GIVE_UP_MS);
        waiting.current.push(settle);
        startTransition(() => router.refresh());
      }),
    [router],
  );
}
