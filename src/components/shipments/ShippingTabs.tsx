"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { ArcSelection } from "@/components/ui/arc-selection";

/**
 * Shipments and their booking confirmations, two lists under one nav tab
 * (2026-10-17) — the customer's own tracking sheet keeps them on one row.
 * Links, as `AdminNav`, because each is a page with its own filters.
 */
export function ShippingTabs({ bookings }: { bookings: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: "/shipments", label: "Shipments" },
    ...(bookings ? [{ href: "/booking-confirmations", label: "Booking confirmations" }] : []),
  ];
  if (items.length < 2) return null;
  return (
    <nav aria-label="Shipping lists" className="mb-md flex">
      <div className={tabs.listShell}>
        <div className={tabs.viewport}>
          <div className={tabs.list}>
            {items.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  data-state={active ? "active" : "inactive"}
                  className={tabs.trigger}
                >
                  {active ? <ArcSelection id="shipping-tab-selection" /> : null}
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
