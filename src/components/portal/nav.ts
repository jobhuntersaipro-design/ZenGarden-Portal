import { CalendarClock, FileText, LayoutDashboard, Package, Users } from "lucide-react";

/**
 * The portal's destinations, shared by the desktop `Sidebar` and the mobile
 * `MobileTabBar` so the two can never drift apart.
 *
 * Destinations only. Upload is an action — the "Upload PO" primary in the page
 * header — never a nav row (00-master.md §4, design reference §3.0).
 */
/** The destination whose nav entry carries the review queue's count. */
export const REVIEW_QUEUE_HREF = "/purchase-orders";

/**
 * **A destination's name is Title Case.** Every other label in the portal is
 * sentence case (00-master.md §4), and these are the exception: a nav row is
 * a proper name for a place, not a sentence about one, and "Purchase Orders"
 * beside "Demand board" read as two different kinds of thing. The rule covers
 * the name wherever it appears — this list, the page's own `<title>`, and any
 * prose that names the destination rather than describing it.
 *
 * `short` is what the 5-up phone tab bar shows, where a two-line label in a
 * ~78px tab is a wall of text.
 */
export const NAV = [
  { href: "/", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard },
  { href: "/purchase-orders", label: "Purchase Orders", short: "Orders", icon: FileText },
  { href: "/demand", label: "Demand Board", short: "Demand", icon: CalendarClock },
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
