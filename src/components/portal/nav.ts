import { Boxes, CalendarClock, FileText, LayoutDashboard, Package, Users } from "lucide-react";
import type { PermissionKey } from "@/lib/permissions/actions";

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
 *
 * `permission` is the key the destination's own page guards on, so a role the
 * grid has taken a page away from does not keep a row that 404s. The two are
 * declared together here rather than in two lists for the reason the rest of
 * this file exists: a nav that says one thing and a page that says another is
 * the drift this module is meant to make impossible. The type comes from
 * `permissions/actions`, which imports nothing but an enum — importing the
 * *guard* here would pull Prisma into the browser bundle.
 */
export const NAV = [
  {
    href: "/",
    label: "Dashboard",
    short: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
  {
    href: "/purchase-orders",
    label: "Purchase Orders",
    short: "Orders",
    icon: FileText,
    permission: "po.view",
  },
  // The board is built entirely from open purchase orders, so it stands or
  // falls with them rather than carrying a key of its own.
  {
    href: "/demand",
    label: "Demand Board",
    short: "Demand",
    icon: CalendarClock,
    permission: "po.view",
  },
  { href: "/buyers", label: "Buyers", short: "Buyers", icon: Users, permission: "buyer.view" },
  {
    href: "/products",
    label: "Products",
    short: "Products",
    icon: Package,
    permission: "product.view",
  },
  { href: "/stock", label: "Stock", short: "Stock", icon: Boxes, permission: "product.view" },
] as const satisfies readonly {
  href: string;
  label: string;
  short: string;
  icon: unknown;
  permission: PermissionKey;
}[];

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

/**
 * The destinations a role may actually open, in nav order.
 *
 * `allowed` is a list of hrefs resolved on the server — the nav components are
 * client components and cannot read a permission themselves. A row the reader
 * would only get a 404 from is worse than no row, which is the whole reason
 * this filter exists rather than leaving every destination on show.
 */
export function navFor(allowed: readonly string[]): typeof NAV[number][] {
  return NAV.filter((entry) => allowed.includes(entry.href));
}

/**
 * The phone tab bar's column count, as literal classes.
 *
 * Tailwind compiles what it can see in the source, so `grid-cols-${n}` built
 * at runtime is not a class — the note this replaces made that point about a
 * hardcoded `grid-cols-6`. The count is no longer fixed now that the bar
 * shows only what the reader may open, so every reachable width is spelled
 * out instead. Six tabs is 65px each at 390, still clear of the 44px floor,
 * and fewer tabs only ever makes them wider.
 */
export const TAB_BAR_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};
