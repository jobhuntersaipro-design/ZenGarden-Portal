"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { ArcSelection } from "@/components/ui/arc-selection";
import { useEdgeFades } from "@/hooks/useEdgeFades";

const TABS = [
  { href: "/admin", label: "User management" },
  { href: "/admin/buyers", label: "Buyer management" },
  { href: "/admin/catalogue", label: "Catalogue" },
  { href: "/admin/test-data", label: "Test data" },
  // The Arc rebuild's preview (docs/specs/60-arc-foundation.md). Leaves once
  // the rebuild has shipped every phase.
  { href: "/admin/arc", label: "Arc preview" },
] as const;

/**
 * The admin shell's rooms, as Arc's tab list — a muted track with the white
 * selection pill gliding between rooms. Links rather than Radix tabs, because
 * each tab is a page. `/admin` matches exactly — a prefix match would light it
 * on every buyers and catalogue page. At 390 the track scrolls inside itself,
 * and the side that still has tabs fades through Arc's own mask
 * (`data-left` / `data-right`), so a cut label reads as "more this way"
 * rather than broken (lessons §4).
 */
export function AdminNav() {
  const pathname = usePathname();
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  return (
    <nav aria-label="Admin sections" className="mb-lg flex">
      <div
        className={tabs.listShell}
        data-left={clipped.left}
        data-right={clipped.right}
      >
        <div ref={ref} onScroll={measure} className={tabs.viewport}>
          <div className={tabs.list}>
            {TABS.map((tab) => {
              const active = isActive(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  data-state={active ? "active" : "inactive"}
                  className={tabs.trigger}
                >
                  {active ? <ArcSelection id="admin-tab-selection" /> : null}
                  <span className={`${tabs.triggerLabel} inline-flex items-center gap-xxs`}>
                    <LinkSpinner />
                    {tab.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
