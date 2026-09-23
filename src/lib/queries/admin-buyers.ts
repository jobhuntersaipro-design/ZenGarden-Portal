import { Role, WebOrderStatus } from "@/generated/prisma/enums";
import { matchesMarket, type BuyerMarketFilter } from "@/lib/buyer-markets";
import { prisma } from "@/lib/prisma";
import {
  accessCounts,
  loginsLabel,
  matchesAccess,
  shopAccess,
  type AccessFilter,
} from "@/lib/queries/admin-buyer-labels";

// Re-exported rather than defined here: `loginsLabel` lives in
// `admin-buyer-labels.ts` because it must stay importable from a client
// component (`BuyersTable`) without dragging `prisma` into the browser
// bundle — see that file's doc comment. Re-exporting keeps this test's own
// import path (`from "@/lib/queries/admin-buyers"`) working unchanged, so
// there is still exactly one implementation and one place it is tested.
export { accessCounts, loginsLabel, matchesAccess, shopAccess };

export type AdminBuyerRow = {
  id: string;
  name: string;
  contactName: string | null;
  /**
   * The one market this buyer buys in, or null while nobody has set one.
   * Shown as a column and filtered on, because since 2026-09-23 it decides
   * what their shop holds: a buyer with no market has an empty shop, so this
   * column is the worklist as much as it is a fact about the account.
   */
  market: string | null;
  /** The company's own accounts address — search only, never shown as a column. */
  email: string | null;
  /** Their shop contacts, for search only — the table shows counts. */
  contactNames: string[];
  contactEmails: string[];
  active: number;
  invited: number;
  disabled: number;
  lastActiveAt: string | null;
  /** Purchase orders and shop orders together: "does anything reference them". */
  orders: number;
  createdAt: string;
};

export const ADMIN_BUYER_SORT_KEYS = [
  "name",
  "market",
  "lastActiveAt",
  "orders",
  "createdAt",
] as const;

export type AdminBuyerSortKey = (typeof ADMIN_BUYER_SORT_KEYS)[number];

/**
 * Deliberately not `listBuyers` (`src/lib/queries/buyers.ts`): that one
 * computes reorder signals, churn risk and a range comparison, cost 2.1s
 * before it was trimmed, and answers "who should we chase". This answers
 * "which account am I managing", which needs counts and a timestamp.
 */
export async function listAdminBuyers(): Promise<AdminBuyerRow[]> {
  const buyers = await prisma.buyer.findMany({
    select: {
      id: true,
      name: true,
      contactName: true,
      email: true,
      market: true,
      createdAt: true,
      _count: {
        select: {
          purchaseOrders: true,
          // A cart is a WebOrder too — `openCart` (src/actions/cart.ts)
          // creates one at the schema default status DRAFT the moment a
          // signed-in client adds their first item, and the guest-cart merge
          // on sign-in does the same. Left unfiltered, a customer who only
          // ever abandoned a cart would show "1 order" here, and this count
          // would disagree with `deleteBuyer`'s own — which already excludes
          // DRAFT for the identical reason. Only a submitted order is real
          // business.
          webOrders: { where: { status: { not: WebOrderStatus.DRAFT } } },
        },
      },
      contacts: {
        where: { role: Role.CLIENT },
        select: {
          name: true,
          email: true,
          disabledAt: true,
          mustChangePassword: true,
          lastActiveAt: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return buyers.map((buyer) => {
    const seen = buyer.contacts
      .map((contact) => contact.lastActiveAt?.getTime())
      .filter((time): time is number => time !== undefined);

    return {
      id: buyer.id,
      name: buyer.name,
      contactName: buyer.contactName,
      email: buyer.email,
      market: buyer.market,
      contactNames: buyer.contacts.map((contact) => contact.name),
      contactEmails: buyer.contacts.map((contact) => contact.email),
      active: buyer.contacts.filter((c) => !c.disabledAt && !c.mustChangePassword).length,
      // Invited, not active: they have a temporary password and have never
      // chosen one. Same derivation the contacts card already shows.
      invited: buyer.contacts.filter((c) => !c.disabledAt && c.mustChangePassword).length,
      disabled: buyer.contacts.filter((c) => c.disabledAt).length,
      lastActiveAt: seen.length > 0 ? new Date(Math.max(...seen)).toISOString() : null,
      orders: buyer._count.purchaseOrders + buyer._count.webOrders,
      createdAt: buyer.createdAt.toISOString(),
    };
  });
}

/** Search and sort in memory: this is a roster of dozens, not a feed. */
export function selectAdminBuyers(
  rows: AdminBuyerRow[],
  {
    q,
    access = "all",
    market = null,
    sort,
  }: {
    q?: string;
    access?: AccessFilter;
    market?: BuyerMarketFilter;
    sort: { key: AdminBuyerSortKey; dir: "asc" | "desc" };
  },
): AdminBuyerRow[] {
  const needle = q?.trim().toLowerCase();

  const filtered = rows.filter((row) => {
    if (!matchesAccess(row, access)) return false;
    if (!matchesMarket(row, market)) return false;
    if (!needle) return true;
    // The market is searchable as well as filterable: typing "Vietnam" into
    // the box should find that market's buyers, the same way typing a
    // contact's name does, rather than only working through the select.
    const haystack = [
      row.name,
      row.contactName ?? "",
      row.email ?? "",
      row.market ?? "",
      ...row.contactNames,
      ...row.contactEmails,
    ];
    return haystack.some((value) => value.toLowerCase().includes(needle));
  });

  const value = (row: AdminBuyerRow): string | number => {
    switch (sort.key) {
      case "name":
        return row.name.toLowerCase();
      case "market":
        /**
         * A buyer with no market is not a buyer in a market called nothing,
         * so it sinks in both directions — the portal's rule since Phase 35,
         * and here it is what keeps the unassigned buyers from filling the
         * top of an ascending sort where somebody is reading down a market.
         * The sentinel flips with the direction because the comparator
         * negates itself for `desc`.
         */
        return row.market?.toLowerCase() ?? (sort.dir === "asc" ? "\uffff" : "");
      case "lastActiveAt":
        // 0, so "Never" sorts as older than every real timestamp rather than
        // landing arbitrarily as NaN.
        return row.lastActiveAt ? Date.parse(row.lastActiveAt) : 0;
      case "orders":
        return row.orders;
      case "createdAt":
        return Date.parse(row.createdAt);
    }
  };

  return [...filtered].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const comparison =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right);
    return sort.dir === "asc" ? comparison : -comparison;
  });
}
