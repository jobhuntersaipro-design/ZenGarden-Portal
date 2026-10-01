"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { ArcSelection } from "@/components/ui-mode/ArcSelection";
import { useIsArc } from "@/components/ui-mode/UiModeProvider";
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
 * Four rooms in the admin shell. `/admin` matches exactly — a prefix match
 * would light it on every buyers and catalogue page.
 *
 * The underline is a pseudo-element that scales from its centre rather than
 * a border that appears: the new tab's line grows as the old one's shrinks,
 * so a click reads as the mark moving. Under reduced motion it just switches.
 */
export function AdminNav() {
  const pathname = usePathname();
  const isArc = useIsArc();
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  if (isArc) return <ArcAdminTabs isActive={isActive} />;

  return (
    <nav
      aria-label="Admin sections"
      // Scrolls sideways rather than pushing the page. The fourth tab (Test
      // data, 2026-09-22) took the row to 390px inside a 310px column and gave
      // every admin page a horizontal scroll at 390 — three tabs fitted, four
      // do not. `-mb-px` on each tab sits on the border, so the border moves
      // onto the nav itself and the scroller keeps it unbroken.
      className="mb-lg flex gap-xs overflow-x-auto border-b border-hairline [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px inline-flex min-h-control-md shrink-0 items-center gap-xxs px-sm text-[length:var(--text-body-sm)] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0 after:origin-center after:border-b-2 after:border-ink after:transition-transform after:duration-200 after:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:after:transition-none ${
              active
                ? "font-medium text-ink after:scale-x-100"
                : "text-ink-secondary after:scale-x-0 hover:text-ink hover:after:scale-x-50 hover:after:border-hairline-strong"
            }`}
          >
            <LinkSpinner />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Arc mode: Arc's tab list — a muted track with the white selection pill
 * gliding between rooms. Links rather than Radix tabs, because each tab is a
 * page. At 390 the track scrolls inside itself, and the side that still has
 * tabs fades through Arc's own mask (`data-left` / `data-right`), so a cut
 * label reads as "more this way" rather than broken (lessons §4). Its own
 * component so the fade measures from mount when the switch flips.
 */
function ArcAdminTabs({ isActive }: { isActive: (href: string) => boolean }) {
  const { ref, clipped, measure } = useEdgeFades<HTMLDivElement>();
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
