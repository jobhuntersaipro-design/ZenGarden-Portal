"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CartScreen } from "@/components/shop/cart/CartScreen";
import { cartCaptions } from "@/components/shop/cart/CartLines";
import { addToCart, removeFromCart, setCartons } from "@/actions/cart";
import { shopHref } from "@/lib/shop-routes";
import type { Cart } from "@/lib/queries/cart";

/**
 * A signed-in client's cart: `cart` is the `WebOrder` `loadCart` already
 * read server-side, and every mutation goes through the Server Actions
 * (`setCartons`, `removeFromCart`, `submitWebOrder`) — `CartScreen` is the
 * shared "one screen" (§5.5); this component supplies only the client's data
 * source, its mutators and its own CTA.
 *
 * Phase 30: a line edit renders the cart the action answers with, at once,
 * and asks for no refresh. Two things were wrong before. Every tap awaited
 * `useAwaitableRefresh()` from inside the stepper's own pending transition,
 * and React entangles a transition started while an async action is pending
 * with that action — so the refresh could not settle until the action did,
 * and the action was waiting on the refresh: every tap sat on the hook's 8 s
 * give-up (measured 8198 ms locally against a 0.6 s wire). And the refresh
 * itself was redundant: `revalidateShop()` inside the action already
 * re-renders this route into the action's own response, which is how the
 * header badge and the mobile bar (the layout's `cartSummary`) catch up.
 * When that payload lands, the fresh `cart` prop replaces the local copy,
 * which by then says the same thing.
 */
export function ClientCart({ cart }: { cart: Cart }) {
  // Derived state, the React way: the prop wins whenever it changes.
  const [local, setLocal] = useState(cart);
  const [seen, setSeen] = useState(cart);
  if (cart !== seen) {
    setSeen(cart);
    setLocal(cart);
  }

  const hasUnavailable = cartCaptions(local.lines).unavailableLabel !== null;

  return (
    <CartScreen
      showSteps
      lines={local.lines}
      subtotal={local.subtotal}
      onSetCartons={async (productId, cartons) => {
        const result = await setCartons({ productId, cartons });
        if (result.success) setLocal(result.data);
        return result;
      }}
      onRemove={async (productId) => {
        const line = local.lines.find((entry) => entry.productId === productId);
        try {
          const result = await removeFromCart(productId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setLocal(result.data);
          // A bin tapped by mistake is one tap to undo, not a line rebuilt
          // from the catalogue (2026-09-25).
          if (line) {
            toast.success(`Removed ${line.name}`, {
              action: {
                label: "Undo",
                onClick: async () => {
                  const back = await addToCart({
                    productId,
                    cartons: line.cartons,
                  });
                  if (!back.success) toast.error(back.error);
                },
              },
            });
          }
        } catch {
          toast.error("We couldn't reach the server. Try again.");
        }
      }}
      cta={<ReviewCta hasUnavailable={hasUnavailable} />}
    />
  );
}

/**
 * The cart hands off; it no longer sends (Phase 32).
 *
 * The buyer's own PO number, the date they want delivery and any note used to
 * be two unlabelled inputs beside a Send button here. They belong on a screen
 * whose job is to show what is about to be sent, so this is a link to
 * `/checkout/review` and nothing else — and the requested date, whose column
 * has existed since Phase 16 and which nothing ever filled in, finally has
 * somewhere to be asked for.
 */
function ReviewCta({ hasUnavailable }: { hasUnavailable: boolean }) {
  if (hasUnavailable) {
    return (
      <div>
        <span
          aria-disabled
          className="flex h-control-lg w-full cursor-not-allowed items-center justify-center rounded-pill bg-ink/40 text-[length:var(--text-button-md)] font-semibold text-canvas"
        >
          Review and send
        </span>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          Remove the unavailable line first
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link
        href={shopHref.checkoutReview()}
        className="flex h-control-lg w-full items-center justify-center pressable rounded-pill bg-ink text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        Review and send
      </Link>
      <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
        You&rsquo;ll add your own PO number next, and see everything before it
        is sent.
      </p>
    </div>
  );
}
