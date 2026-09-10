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
 * (`setCartons`, `removeFromCart`, `submitWebOrder`) unchanged from Phase 16
 * — `CartScreen` is the shared "one screen" (§5.5); this component supplies
 * only the client's data source, its mutators and its own CTA.
 */
export function ClientCart({ cart }: { cart: Cart }) {
  const refresh = useAwaitableRefresh();
  const [, startTransition] = useTransition();
  const hasUnavailable = cartCaptions(cart.lines).unavailableLabel !== null;

  return (
    <CartScreen
      lines={cart.lines}
      subtotal={cart.subtotal}
      onSetCartons={async (productId, cartons) => {
        const result = await setCartons({ productId, cartons });
        if (result.success) await refresh();
        return result;
      }}
      onRemove={(productId) => {
        startTransition(async () => {
          const result = await removeFromCart(productId);
          if (!result.success) toast.error(result.error);
          else await refresh();
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
