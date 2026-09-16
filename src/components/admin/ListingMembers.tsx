"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { removeProductFromFamily } from "@/actions/product-families";
import { setProductPublished } from "@/actions/products";
import { Button } from "@/components/ui/button";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import type { ListingMember } from "@/lib/queries/product-families";

/**
 * One market's section of a listing — which is exactly one card on the shop
 * (Phase 40). Grouped by market rather than listed flat because a family in
 * two markets is two listings to a buyer, and an admin deciding what a card
 * offers has to see the card.
 *
 * Hiding a variant is `setProductPublished`, the same flag ops already uses
 * for "not on the shop"; removing one from the family returns it to derived
 * grouping. Neither deletes anything, and the page says so.
 */
export function ListingMembers({
  market,
  members,
}: {
  market: string | null;
  members: ListingMember[];
}) {
  const refresh = useAwaitableRefresh();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (
    id: string,
    work: () => Promise<{ success: boolean; error?: string }>,
    done: string,
  ) => {
    setBusy(id);
    try {
      const result = await work();
      if (!result.success) {
        toast.error(result.error ?? "That didn't work.");
        return;
      }
      toast.success(done);
      await refresh();
    } catch {
      // An unguarded await here is what left the avatar picker permanently
      // disabled on 2026-09-08 — the same trap, guarded the same way.
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const shown = members.filter((member) => member.active).length;

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-md">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-[length:var(--text-heading-sm)] font-[650] text-ink">
          {market ?? "No market"}
        </h3>
        <p className="text-[length:var(--text-caption)] text-ink-tertiary">
          {shown} of {members.length} shown on the shop
        </p>
      </div>

      <ul className="mt-sm flex flex-col divide-y divide-hairline border-y border-hairline">
        {members.map((member) => {
          const flavour = member.variant ?? "Standard";
          return (
            <li key={member.id} className="flex flex-wrap items-center gap-sm py-sm">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${member.id}`}
                  className="text-[length:var(--text-body-sm)] font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {flavour}
                </Link>
                <p className="font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                  {member.sku} · {unitLabel(member.packSize, member.unit)} ·{" "}
                  {formatMYR(member.listPrice)}
                </p>
              </div>

              {/* `PublishToggle`'s treatment exactly: this pill and that one
                  draw the same `Product.active`, and one status may only have
                  one colour. The words stay the spec's. */}
              <span
                className={`rounded-full bg-surface-soft px-sm py-xxs text-[length:var(--text-caption)] ${
                  member.active ? "text-accent-green" : "text-ink-tertiary"
                }`}
              >
                {member.active ? "Shown" : "Hidden"}
              </span>

              <div className="flex items-center gap-xs">
                <Button
                  type="button"
                  variant="outline"
                  pending={busy === member.id}
                  onClick={() =>
                    run(
                      member.id,
                      () => setProductPublished(member.id, !member.active),
                      member.active
                        ? `${flavour} hidden from the shop`
                        : `${flavour} shown on the shop`,
                    )
                  }
                  className="h-control-md px-md sm:h-control-sm"
                >
                  {member.active ? "Hide from shop" : "Show"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  pending={busy === member.id}
                  onClick={() =>
                    run(
                      member.id,
                      () => removeProductFromFamily(member.id),
                      `${flavour} removed from this listing`,
                    )
                  }
                  className="h-control-md px-md sm:h-control-sm"
                >
                  Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
