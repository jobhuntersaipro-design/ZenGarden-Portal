"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";

const TABS = [
  { href: "/admin", label: "Users" },
  { href: "/admin/customers", label: "Customers" },
] as const;

/**
 * Two rooms in the admin shell. `/admin` matches exactly — a prefix match
 * would light both tabs on every customers page.
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
            className={`-mb-px inline-flex min-h-control-md items-center gap-xxs border-b-2 px-sm text-[length:var(--text-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              active
                ? "border-ink font-medium text-ink"
                : "border-transparent text-ink-secondary hover:text-ink"
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
