"use client";

import { useState } from "react";
import Link from "next/link";
import { AddToCart } from "@/components/shop/AddToCart";
import { CartonStepper } from "@/components/shop/CartonStepper";
import { ProductThumb } from "@/components/products/ProductThumb";
import { unitLabel } from "@/lib/cartons";
import { formatMYR } from "@/lib/money";
import { variantLabels } from "@/lib/product-groups";
import { shopHref } from "@/lib/shop-routes";
import type { ShopProduct, ShopProductGroup } from "@/lib/queries/shop-catalogue";

/**
 * One card in the catalogue.
 *
 * Phase 31: a card is a *group* — one product and every flavour of it. Picking
 * a flavour switches the card's picture, price, link and Add to cart button
 * without leaving the page, because each flavour is its own product row with
 * its own SKU and price. A group of one renders exactly the card it always
 * did: no picker, nothing else changed.
 *
 * A client component only for `useState` on the chosen flavour. Everything it
 * shows is data the server already loaded; nothing is fetched here.
 */
export function ShopProductCard({
  group,
  badge,
}: {
  group: ShopProductGroup;
  /** e.g. "Best seller" — a pill over the top-left of the image well. */
  badge?: string;
}) {
  const [selectedId, setSelectedId] = useState(group.variants[0]?.id);
  /**
   * How many cartons this card adds. One by default, so "add the one I am
   * looking at" stays a single tap, and it goes back to one when the buyer
   * picks another flavour — three of Lemon says nothing about Lime.
   */
  const [cartons, setCartons] = useState(1);
  const selected =
    group.variants.find((variant) => variant.id === selectedId) ?? group.variants[0];
  const labels = variantLabels(group.variants);
  const hasChoice = group.variants.length > 1;

  if (!selected) return null;

  const subtitle = [group.brand, hasChoice ? null : selected.variant]
    .filter(Boolean)
    .join(" · ");
  // "12 per carton · Malaysia". The pack half is dropped where the listing
  // mixes packs (Phase 40) — the picker carries it per variant there, and
  // "per carton" alone would read as a claim about all of them.
  const packCaption = [
    group.packSize === null ? null : unitLabel(group.packSize, group.unit),
    group.market,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex flex-col rounded-lg border border-hairline bg-canvas p-md transition-colors hover:border-hairline-strong hover:shadow-sm">
      <Link
        href={shopHref.product(selected.id)}
        className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <div className="relative aspect-square overflow-hidden rounded-md bg-surface-soft">
          <ProductThumb name={selected.name} url={selected.imageUrl} />
          {badge ? (
            <span className="absolute top-xs left-xs rounded-pill bg-ink px-xs py-xxs text-[length:var(--text-caption)] font-semibold text-canvas">
              {badge}
            </span>
          ) : null}
        </div>
        <h3
          className="mt-xs text-[length:var(--text-body-sm)] font-semibold text-ink"
          title={group.name}
        >
          {group.name}
        </h3>
      </Link>
      {subtitle ? (
        <p className="text-[length:var(--text-caption)] text-ink-tertiary" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
      <p className="mt-xxs text-[length:var(--text-caption)] text-ink-tertiary">
        {packCaption}
      </p>

      {hasChoice ? (
        <VariantChips
          group={group}
          labels={labels}
          selectedId={selected.id}
          onSelect={(id) => {
            setSelectedId(id);
            setCartons(1);
          }}
        />
      ) : null}

      {/* Always the selected flavour's own price — the one Add to cart below
          puts in the cart. Until 2026-09-17 a listing priced apart printed
          "from" and its cheapest flavour whatever was selected, so a buyer
          choosing a RM 10.00 flavour read RM 5.00. A flavour is always
          selected, so there is no range left to show. */}
      <p className="mt-xs text-[length:var(--text-body-md)] font-semibold tabular-nums text-ink">
        {formatMYR(Number(selected.listPrice))}
        <span className="ml-xxs text-[length:var(--text-caption)] font-normal text-ink-tertiary">
          {`per ${group.unit}`}
        </span>
      </p>

      {/* The quantity is chosen here rather than only on the product page
          (2026-09-18): a buyer ordering by the carton usually knows how many
          before they open anything. The label is the column the cart uses. */}
      <div className="mt-auto flex flex-col gap-xs pt-sm">
        <div className="flex flex-col gap-xxs">
          {/* Visual only: each control inside the stepper carries its own
              accessible name, which already names the product too. */}
          <span className="text-[length:var(--text-caption)] text-ink-tertiary">
            Cartons
          </span>
          <CartonStepper
            size="card"
            value={cartons}
            packSize={selected.packSize}
            unit={selected.unit}
            label={selected.name}
            onChange={async (next) => {
              setCartons(next);
              return { success: true };
            }}
          />
        </div>
        <AddToCart
          key={selected.id}
          productId={selected.id}
          name={selected.name}
          packSize={selected.packSize}
          unit={selected.unit}
          variant="card"
          cartons={cartons}
        />
      </div>
    </li>
  );
}

/**
 * The flavour picker inside a card — two controls, one choice.
 *
 * **A select on a phone, chips above `sm`.** Chips alone were measured at
 * 28px tall at 390px, against this project's 44px floor, and eight of them
 * scrolled *inside* the card (80px of row holding 252px of chips) so a buyer
 * had to scroll within a card to find a flavour. A native select is one
 * 44px control whatever the flavour count, and it is what a phone already
 * knows how to present.
 *
 * Above `sm` the chips are a radio group rather than plain buttons: this is
 * one choice among several, which is what a screen reader should hear, and
 * arrow keys then move between flavours for free. The row no longer clips —
 * grid items stretch, so the cards in a row stay the same height anyway.
 */
function VariantChips({
  group,
  labels,
  selectedId,
  onSelect,
}: {
  group: ShopProductGroup;
  labels: Map<string, string>;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <select
        aria-label={`Variant — ${group.name}`}
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        className="mt-xs h-11 w-full rounded-sm border border-hairline-strong bg-canvas px-xs text-[length:var(--text-caption)] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:hidden"
      >
        {group.variants.map((variant: ShopProduct) => (
          <option key={variant.id} value={variant.id}>
            {labels.get(variant.id)}
          </option>
        ))}
      </select>

      <div
        role="radiogroup"
        aria-label={`Variant — ${group.name}`}
        className="mt-xs hidden flex-wrap gap-xxs sm:flex"
      >
        {group.variants.map((variant: ShopProduct) => {
          const isSelected = variant.id === selectedId;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(variant.id)}
              title={labels.get(variant.id)}
              className={`max-w-full truncate rounded-pill border px-xs py-xxs text-[length:var(--text-caption)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                isSelected
                  ? "border-ink bg-ink font-semibold text-canvas"
                  : "border-hairline-strong text-ink-secondary hover:border-ink hover:text-ink"
              }`}
            >
              {labels.get(variant.id)}
            </button>
          );
        })}
      </div>
    </>
  );
}
