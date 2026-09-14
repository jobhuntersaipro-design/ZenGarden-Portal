"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartScreen } from "@/components/shop/cart/CartScreen";
import { cartCaptions } from "@/components/shop/cart/CartLines";
import { removeFromCart, setCartons, submitWebOrder } from "@/actions/cart";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
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
  const refresh = useAwaitableRefresh();
  const [, startTransition] = useTransition();

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
      lines={local.lines}
      subtotal={local.subtotal}
      onSetCartons={async (productId, cartons) => {
        const result = await setCartons({ productId, cartons });
        if (result.success) setLocal(result.data);
        return result;
      }}
      onRemove={(productId) => {
        startTransition(async () => {
          const result = await removeFromCart(productId);
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          setLocal(result.data);
        });
      }}
      cta={<SendOrderCta hasUnavailable={hasUnavailable} refresh={refresh} />}
    />
  );
}

function SendOrderCta({
  hasUnavailable,
  refresh,
}: {
  hasUnavailable: boolean;
  refresh: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div>
      <div className="flex flex-col gap-xs">
        <Input
          aria-label="Your reference"
          placeholder="Your own PO number (optional)"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <Input
          aria-label="Notes for the team"
          placeholder="Anything the team should know (optional)"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="mt-sm">
        <Button
          pending={pending}
          disabled={hasUnavailable}
          className="w-full"
          onClick={() =>
            startTransition(async () => {
              const result = await submitWebOrder({
                buyerReference: reference || null,
                notes: notes || null,
              });
              if (result.success) {
                toast.success(`Order ${result.data.reference} sent.`);
                await refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          Send order
        </Button>
        {hasUnavailable ? (
          <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
            Remove the unavailable line first
          </p>
        ) : null}
      </div>
    </div>
  );
}
