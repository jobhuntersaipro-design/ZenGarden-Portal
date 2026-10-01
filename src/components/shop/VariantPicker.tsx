import Link from "next/link";
import chip from "@/components/arc/chip-group/chip-group.module.css";
import { ModeSwitch } from "@/components/ui-mode/ModeSwitch";
import { formatMYR } from "@/lib/money";
import { variantLabels } from "@/lib/product-groups";
import { shopHref } from "@/lib/shop-routes";
import type { ShopVariant } from "@/lib/queries/shop-catalogue";

/**
 * The flavours of one product, on the product's own page (Phase 31).
 *
 * Links, not buttons, and deliberately so. Each flavour is a separate product
 * with its own SKU, price, images and page, so choosing one is a navigation —
 * which makes every flavour addressable, shareable and reachable with the
 * browser's own Back. A server component for the same reason: there is no
 * state here to hold.
 *
 * The chosen flavour is rendered as the current page rather than as a link,
 * carrying `aria-current`, so a screen reader is told which one it is on.
 */
export function VariantPicker({
  variants,
  selectedId,
}: {
  variants: ShopVariant[];
  selectedId: string;
}) {
  const labels = variantLabels(variants);
  const selected = variants.find((variant) => variant.id === selectedId);
  const prices = new Set(variants.map((variant) => variant.listPrice));
  // Only worth printing a price on each chip when they actually differ;
  // otherwise the buy box above already says it once.
  const showPrices = prices.size > 1;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-sm">
        <h2
          id="variant-picker"
          className="text-[length:var(--text-caption)] font-semibold text-ink"
        >
          Variant
        </h2>
        {selected ? (
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
            {labels.get(selected.id)}
          </span>
        ) : null}
      </div>

      <ul
        aria-labelledby="variant-picker"
        className="mt-xs flex flex-wrap gap-xs"
      >
        <ModeSwitch arc={<>
        {/* Arc mode: each variant is one of Arc's chips (arc/chip-group),
            the current one tinted. */}
        {variants.map((variant) => {
          const isSelected = variant.id === selectedId;
          const label = labels.get(variant.id) ?? variant.sku;
          const priceSuffix = showPrices ? ` · ${formatMYR(Number(variant.listPrice))}` : "";
          const body = (
            <span className={`${chip.body} h-11`} data-selected={isSelected}>
              <span className={`${chip.surface} right-0`} aria-hidden />
              <span className={chip.label}>
                {label}
                {priceSuffix}
              </span>
            </span>
          );
          return (
            <li key={variant.id}>
              {isSelected ? (
                <span aria-current="page" className={`${chip.chip} text-ink`}>
                  {body}
                </span>
              ) : (
                <Link href={shopHref.product(variant.id)} className={chip.chip}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
        </>}>
        {variants.map((variant) => {
          const isSelected = variant.id === selectedId;
          const label = labels.get(variant.id) ?? variant.sku;
          const priceSuffix = showPrices ? ` · ${formatMYR(Number(variant.listPrice))}` : "";

          return (
            <li key={variant.id}>
              {isSelected ? (
                <span
                  aria-current="page"
                  className="flex h-11 items-center rounded-pill border border-ink bg-ink px-md text-[length:var(--text-body-sm)] font-semibold text-canvas"
                >
                  {label}
                  {priceSuffix}
                </span>
              ) : (
                <Link
                  href={shopHref.product(variant.id)}
                  className="flex h-11 items-center rounded-pill border border-hairline-strong px-md text-[length:var(--text-body-sm)] text-ink-secondary hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  {label}
                  {priceSuffix}
                </Link>
              )}
            </li>
          );
        })}
        </ModeSwitch>
      </ul>
    </div>
  );
}
