"use server";

import { UnauthorizedError } from "@/lib/auth-guards";
import { requirePermission } from "@/lib/permissions/require";
import { resolveListing, type ListingMatch } from "@/lib/listings";
import { listingCandidates } from "@/lib/queries/product-families";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Which listing the product on the form would join, for the line the create
 * page and the edit drawer print above the family picker (Phase 40).
 *
 * A read, and only a read. The write runs the same resolver again inside its
 * own transaction, because between this answer and the save another admin
 * may have created the family this said did not exist — so the line is
 * allowed to describe and never to promise.
 *
 * Super admin only, like every other product read that the ops room's own
 * 404 already covers: this one is reachable as a Server Action, so it is
 * checked here too.
 */
export async function lookupListing(input: {
  brand: string | null;
  name: string;
  variant: string | null;
  market: string | null;
  excludeId?: string;
}): Promise<ActionResult<ListingMatch>> {
  try {
    await requirePermission("product.manage");
  } catch (cause) {
    return {
      success: false,
      error:
        cause instanceof UnauthorizedError ? cause.message : "You are not signed in.",
    };
  }

  try {
    const candidates = await listingCandidates({ brand: input.brand, market: input.market });
    return { success: true, data: resolveListing(input, candidates, input.excludeId) };
  } catch (cause) {
    console.error("[listings] lookupListing", cause);
    return { success: false, error: "We couldn't check the listings." };
  }
}
