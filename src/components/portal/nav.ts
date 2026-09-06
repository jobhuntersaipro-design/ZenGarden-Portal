import { FileText, LayoutDashboard, Package, Users } from "lucide-react";

/**
 * The portal's destinations, shared by the desktop `Sidebar` and the mobile
 * `MobileTabBar` so the two can never drift apart.
 *
 * Destinations only. Upload is an action — the "Upload PO" primary in the page
 * header — never a nav row (00-master.md §4, design reference §3.0).
 */
export const NAV = [
  { href: "/", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard },
  // Title case at the user's request (2026-09-06) — the one label that is.
  // `short` is what the 4-up tab bar shows: "Purchase Orders" over two lines
  // in a ~90px tab is a wall of text where "Orders" reads at a glance.
  { href: "/purchase-orders", label: "Purchase Orders", short: "Orders", icon: FileText },
  { href: "/buyers", label: "Buyers", short: "Buyers", icon: Users },
  { href: "/products", label: "Products", short: "Products", icon: Package },
] as const;

/** /upload and /review/[id] belong to the Purchase orders section. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/purchase-orders") {
    return (
      pathname.startsWith("/purchase-orders") ||
      pathname.startsWith("/upload") ||
      pathname.startsWith("/review")
    );
  }
  return pathname.startsWith(href);
}
