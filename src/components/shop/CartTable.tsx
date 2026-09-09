"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { removeFromCart, setCartons, submitWebOrder } from "@/actions/cart";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatMYR } from "@/lib/money";
import { shopHref } from "@/lib/shop-routes";
import type { Cart } from "@/lib/queries/cart";

export function CartTable({ cart }: { cart: Cart }) {
  const refresh = useAwaitableRefresh();
  const [pending, startTransition] = useTransition();
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const blocked = cart.lines.some((line) => line.unavailable);

  if (cart.lines.length === 0) {
    return (
      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="text-[length:var(--text-body-md)] text-ink">
          Your order is empty.
        </p>
        <Link
          href={shopHref.home()}
          className="mt-xs inline-block text-[length:var(--text-body-sm)] text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          Browse the catalogue
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <ul className="flex flex-col gap-sm">
        {cart.lines.map((line) => (
          <li
            key={line.productId}
            className="flex flex-wrap items-start justify-between gap-sm rounded-lg border border-hairline bg-canvas p-md"
          >
            <div className="min-w-0 flex-1">
              <Link
                href={shopHref.product(line.productId)}
                className="text-[length:var(--text-body-sm)] font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {line.name}
              </Link>
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                {[line.brand, line.variant, line.sku].filter(Boolean).join(" · ")}
              </p>
              {line.unavailable ? (
                <p className="mt-xxs text-[length:var(--text-caption)] text-accent-red">
                  No longer available — remove it to send your order
                </p>
              ) : (
                <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
                  {`${formatMYR(Number(line.unitPrice))} per ${line.unit}`}
                </p>
              )}
            </div>

            <CartonStepper
              value={line.cartons}
              packSize={line.packSize}
              unit={line.unit}
              label={line.name}
              onChange={async (cartons) => {
                const result = await setCartons({ productId: line.productId, cartons });
                if (result.success) await refresh();
                return result;
              }}
            />

            <div className="flex items-center gap-sm">
              <p className="w-28 text-right text-[length:var(--text-body-sm)] font-semibold tabular-nums text-ink">
                {line.unavailable ? "—" : formatMYR(Number(line.amount))}
              </p>
              <Button
                variant="secondary"
                aria-label={`Remove ${line.name}`}
                className="size-11 p-0 sm:size-control-sm"
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeFromCart(line.productId);
                    if (!result.success) toast.error(result.error);
                    else await refresh();
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <section className="rounded-lg border border-hairline bg-canvas p-lg">
        <div className="flex items-baseline justify-between gap-sm">
          <span className="text-[length:var(--text-body-md)] text-ink-secondary">
            Order total
          </span>
          <span className="text-[length:var(--text-display-md)] font-semibold tabular-nums text-ink">
            {formatMYR(Number(cart.subtotal))}
          </span>
        </div>
        <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
          Prices are today&rsquo;s. The team confirms every order before it is
          final, and will be in touch if anything has changed.
        </p>

        <div className="mt-md flex flex-col gap-xs">
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

        <div className="mt-md">
          <Button
            pending={pending}
            disabled={blocked}
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
          {blocked ? (
            <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
              Remove the unavailable line first
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
