"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/**
 * Collapsed by default, and nothing inside is mounted until it opens.
 *
 * These cards answer "how are we doing", which is a question you go looking
 * for; the status bars above answer "what is outstanding", which has to be in
 * front of you. Putting them behind one control is what keeps the second
 * question above the fold.
 */
export function MoreAnalytics({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const { replace, pending } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (open) params.delete("more");
    else params.set("more", "1");
    replace(`${pathname}?${params.toString()}`);
  };

  return (
    <section className="mt-lg">
      <div className="relative flex items-center justify-center">
        <span aria-hidden className="absolute inset-x-0 h-px bg-hairline" />
        <Button
          variant="secondary"
          aria-expanded={open}
          aria-controls="more-analytics"
          pending={pending}
          onClick={toggle}
          className="relative bg-canvas"
        >
          {/* The cards are rendered on the server, so opening is a wait. */}
          {pending
            ? open
              ? "Hiding…"
              : "Loading analytics…"
            : open
              ? "Hide analytics"
              : "More analytics"}
        </Button>
      </div>

      {/* Not merely hidden: unmounted, so a closed disclosure costs nothing. */}
      {open ? (
        <div id="more-analytics" className="mt-lg flex flex-col gap-lg">
          {children}
        </div>
      ) : null}
    </section>
  );
}
