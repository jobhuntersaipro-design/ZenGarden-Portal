"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";

const TABS = [
  { href: "/admin", label: "User management" },
  { href: "/admin/buyers", label: "Buyer management" },
] as const;

/**
 * Two rooms in the admin shell. `/admin` matches exactly — a prefix match
 * would light both tabs on every buyers page.
 *
 * The underline is a pseudo-element that scales from its centre rather than
 * a border that appears: the new tab's line grows as the old one's shrinks,
 * so a click reads as the mark moving. Under reduced motion it just switches.
 */
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin sections" className="mb-lg flex gap-xs border-b border-hairline">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px inline-flex min-h-control-md items-center gap-xxs px-sm text-[length:var(--text-body-sm)] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0 after:origin-center after:border-b-2 after:border-ink after:transition-transform after:duration-200 after:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:after:transition-none ${
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
