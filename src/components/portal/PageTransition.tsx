"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * A page arriving: its top-level blocks fade and rise in turn (`page-enter`).
 *
 * Keyed by the pathname, not left to a `template.tsx`, so what replays it is
 * exactly a change of page. A chip, a sort or a page of the table changes only
 * the search params and must not make the whole screen jump again.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="page-enter">
      {children}
    </div>
  );
}
