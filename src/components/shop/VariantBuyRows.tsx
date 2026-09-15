"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addManyToCart } from "@/actions/cart";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { useGuestCart } from "@/components/shop/GuestCartProvider";
import { useShopViewer } from "@/components/shop/ShopViewer";
import { Button } from "@/components/ui/button";
import { lineTotal } from "@/lib/cartons";
import { formatMYR, sumDecimals } from "@/lib/money";
import { variantLabels } from "@/lib/product-groups";
import type { ShopVariant } from "@/lib/queries/shop-catalogue";

/**
 * A quantity against each flavour, added in one action (Phase 39).
 *
 * The chip picker above this stays and is not replaced: it is navigation, and
 * how a buyer reaches a flavour's own gallery, description and specs. This is
 * the other half they asked for — three cartons of Papaya and two of Lavender
 * without visiting two pages.
 *
 * Every row starts at 0 except the flavour whose page this is, which starts at
 * 1, so "add the one I am looking at" is still one click. `CartonStepper` takes
 * `min={0}` here rather than its default 1, because a row at 0 is a flavour not
 * being ordered and that is the state most rows are in; its `onChange`
 * resolves locally rather than calling a Server Action, which is the whole
 * point of collecting the quantities before sending them.
 *
 * Money is summed with `sumDecimals` over `lineTotal`'s own strings rather
 * than with `Number`: the figure beside Add to cart must be the one the cart
 * will show, and float addition of cents is how those two come to differ.
 */
export function VariantBuyRows({
  variants,
  selectedId,
}: {
  variants: ShopVariant[];
  selectedId: string;
}) {
  const viewer = useShopViewer();
  const guestCart = useGuestCart();
  const [pending, startTransition] = useTransition();
  const [cartons, setCartons] = useState<Record<string, number>>({ [selectedId]: 1 });

  const labels = variantLabels(variants);
  const chosen = variants
    .map((variant) => ({ variant, cartons: cartons[variant.id] ?? 0 }))
    .filter((row) => row.cartons > 0);
  const totalCartons = chosen.reduce((sum, row) => sum + row.cartons, 0);
  const total = sumDecimals(
    chosen.map((row) => lineTotal(row.cartons, row.variant.listPrice)),
  );
  const unit = variants[0]?.unit ?? "carton";

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  const run = () => {
    const lines = chosen.map((row) => ({
      productId: row.variant.id,
      cartons: row.cartons,
    }));
    if (lines.length === 0) return;

    const added = `${plural(totalCartons, unit)} across ${plural(lines.length, "variant")} added to your order.`;

    startTransition(async () => {
      if (viewer.kind !== "client") {
        guestCart.addMany(lines);
        // Reset before the toast, not after: a second click on a screen still
        // showing the old quantities would send them twice.
        setCartons({});
        toast.success(added);
        return;
      }

      const result = await addManyToCart({ lines });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCartons({});
      if (result.data.skipped > 0) {
        toast.warning(
          `${added} ${plural(result.data.skipped, "variant")} ${result.data.skipped === 1 ? "is" : "are"} no longer available.`,
        );
      } else {
        toast.success(added);
      }
    });
  };

  return (
    <div className="mt-lg">
      <h3 className="text-[length:var(--text-caption)] font-semibold text-ink">
        How many of each
      </h3>

      <ul className="mt-xs flex flex-col divide-y divide-hairline border-y border-hairline">
        {variants.map((variant) => {
          const count = cartons[variant.id] ?? 0;
          const isSelected = variant.id === selectedId;

          return (
            <li
              key={variant.id}
              className="flex flex-wrap items-center gap-sm py-sm sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-[length:var(--text-body-sm)] ${
                    isSelected ? "font-semibold text-ink" : "text-ink-secondary"
                  }`}
                >
                  {labels.get(variant.id) ?? variant.sku}
                </p>
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {formatMYR(variant.listPrice)} per {variant.unit}
                  {isSelected ? " · on this page" : ""}
                </p>
              </div>

              <CartonStepper
                value={count}
                min={0}
                packSize={variant.packSize}
                unit={variant.unit}
                label={labels.get(variant.id) ?? variant.sku}
                onChange={async (next) => {
                  setCartons((current) => ({ ...current, [variant.id]: next }));
                  return { success: true };
                }}
              />

              <p className="w-24 shrink-0 text-right text-[length:var(--text-body-sm)] tabular-nums text-ink">
                {count > 0 ? formatMYR(lineTotal(count, variant.listPrice)) : "—"}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-md flex flex-wrap items-center justify-between gap-sm">
        <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
          {totalCartons === 0
            ? "Choose a quantity"
            : `${plural(totalCartons, unit)} across ${plural(chosen.length, "variant")}`}
        </p>
        <p className="text-[length:var(--text-body-lg)] font-semibold tabular-nums text-ink">
          {formatMYR(total)}
        </p>
      </div>

      <Button
        type="button"
        pending={pending}
        disabled={totalCartons === 0}
        onClick={run}
        className="mt-sm h-control-lg w-full gap-xs"
      >
        <Plus className="size-4 shrink-0" aria-hidden />
        Add to cart
      </Button>
    </div>
  );
}
