"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReorderResult } from "@/actions/reorder";
import { reorderMessage } from "@/lib/reorder-message";
import { shopHref } from "@/lib/shop-routes";

/**
 * Runs a reorder action, says what happened, and takes the buyer to the cart
 * (Phase 57 D2a). Shared by the order page's button and the account menu's
 * row so the two cannot word the outcome differently.
 *
 * A thrown action — the server unreachable mid-deploy — is caught and said,
 * so `pending` always settles (the 2026-09-08 avatar defect).
 */
export function useReorder() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ReorderResult>) =>
    startTransition(async () => {
      let result: ReorderResult;
      try {
        result = await action();
      } catch {
        toast.error("We couldn't reach the server. Try again.");
        return;
      }
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const { added, skipped } = result.data;
      (skipped.length > 0 ? toast.warning : toast.success)(reorderMessage(added, skipped));
      router.push(shopHref.cart());
    });

  return { pending, run };
}
