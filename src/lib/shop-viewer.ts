import { cache } from "react";
import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { shopAudience, type ShopAudience } from "@/lib/shop-market";

export type ShopViewer =
  | { kind: "guest" }
  | {
      kind: "client";
      id: string;
      name: string;
      email: string;
      image: string | null;
      buyerId: string;
      buyerName: string;
      /**
       * The market their buyer buys in, or null while nobody has set one.
       * Every shop page turns this into a `ShopAudience` and either scopes
       * its query to it or renders the "no market" state — see
       * `src/lib/shop-market.ts`.
       */
      market: string | null;
    };

export const GUEST: ShopViewer = { kind: "guest" };

/**
 * Who is looking at the shop. "staff" is returned rather than a viewer so the
 * layout can redirect them to the portal — the half-state a member browsing
 * the shop would create is the one 15 §3.2 removed, and it stays removed.
 *
 * Reads the row, not the token, for the same reason `requireClient` does:
 * a revoked contact has to stop now, not within five minutes.
 *
 * Wrapped in React's `cache()` because the storefront layout and every page
 * under it each call this, and each call is an `auth()` — which re-reads the
 * user row whenever the token is older than five minutes, and a Server
 * Component render cannot write the refreshed token back — plus a second
 * read here. One render, one viewer (Phase 30). Outside a request `cache`
 * calls straight through, so the unit tests see it unchanged.
 */
export const loadShopViewer = cache(async (): Promise<ShopViewer | "staff"> => {
  const session = await getSessionUser();
  if (!session) return GUEST;
  if (session.role !== Role.CLIENT) return "staff";
  const row = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      email: true,
      image: true,
      buyerId: true,
      // `market` alongside the name, from the same read: the whole shop is
      // scoped by it, so resolving it separately would be a second query
      // per page and a chance for two parts of one render to disagree.
      buyer: { select: { name: true, market: true } },
    },
  });
  if (!row?.buyerId || !row.buyer) return GUEST;
  return {
    kind: "client",
    id: session.id,
    name: row.name,
    email: row.email,
    image: row.image,
    buyerId: row.buyerId,
    buyerName: row.buyer.name,
    market: row.buyer.market,
  };
});

/**
 * The audience a storefront page should draw for.
 *
 * Pages call this rather than reading `viewer.market` themselves, so the
 * "signed in but no market" case is one named state every screen handles the
 * same way instead of four `?? null` branches that each guess.
 *
 * A guest or a member reaching here means the layout's own redirects did not
 * run — which they always do — so this returns `unassigned` rather than
 * throwing: the page then renders the "no market" panel, which is the right
 * thing to show somebody who must not see products. It fails closed.
 *
 * Free: `loadShopViewer` is `cache()`d, so this shares the layout's read.
 */
export async function loadShopAudience(): Promise<ShopAudience> {
  const viewer = await loadShopViewer();
  if (viewer === "staff" || viewer.kind === "guest") return { kind: "unassigned" };
  return shopAudience(viewer.market);
}
