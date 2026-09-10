"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartLines, cartCaptions } from "@/components/shop/cart/CartLines";
import { OrderSummary } from "@/components/shop/cart/OrderSummary";
import { removeFromCart, setCartons, submitWebOrder } from "@/actions/cart";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { shopHref } from "@/lib/shop-routes";
import type { Cart } from "@/lib/queries/cart";

/**
 * A signed-in client's cart: `cart` is the `WebOrder` `loadCart` already
 * read server-side, and every mutation goes through the Server Actions
 * (`setCartons`, `removeFromCart`, `submitWebOrder`) unchanged from Phase 16
 * — only the surrounding screen is new (§5.5's "same screen from the same
 * components").
 */
export function ClientCart({ cart }: { cart: Cart }) {
  const refresh = useAwaitableRefresh();
  const [, startTransition] = useTransition();

  if (cart.lines.length === 0) {
    return (
      <div className="pt-lg">
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
          Your cart
        </h1>
        <div className="mt-lg rounded-lg border border-hairline p-xxl text-center">
          <p className="text-[length:var(--text-body-md)] text-ink-secondary">
            Your cart is empty.
          </p>
          <Link
            href={shopHref.catalogue()}
            className="mx-auto mt-md flex h-control-lg w-fit items-center rounded-pill bg-ink px-lg text-[length:var(--text-button-md)] font-semibold text-canvas hover:bg-ink-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Browse the catalogue
          </Link>
        </div>
      </div>
    );
  }

  const captions = cartCaptions(cart.lines);

  return (
    <div className="pt-lg">
      <h1 className="font-display text-[length:var(--text-display-md)] font-[650] text-ink">
        Your cart
      </h1>
      <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-tertiary">
        {captions.totalLabel}. Prices are today&rsquo;s and are confirmed by our team
        before delivery.
      </p>
      {captions.unavailableLabel ? (
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          {captions.unavailableLabel}
        </p>
      ) : null}

      <div className="mt-lg grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <CartLines
          lines={cart.lines}
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
        />
        <OrderSummary
          productCount={captions.availableCount}
          cartonCount={captions.availableCartons}
          subtotal={cart.subtotal}
          cta={<SendOrderCta hasUnavailable={captions.unavailableLabel !== null} refresh={refresh} />}
        />
      </div>
    </div>
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
