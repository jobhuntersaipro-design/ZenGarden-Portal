"use client";

import { X } from "lucide-react";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { StagedImages, type StagedImage } from "@/components/products/StagedImages";
import { Input } from "@/components/ui/input";

/** One row of the create form's Variants section. Local state only: `key` is
 *  a React key and the handle staged images are filed under, and never leaves
 *  the browser — the submit maps a row to
 *  `{ variant, sku, listPrice, stockCartons }`. */
export type VariantRowState = {
  key: string;
  variant: string | null;
  sku: string;
  /** Set on the first keystroke in this row's SKU field; the row stops
   *  following the proposal from then on, and only this row. */
  skuTouched: boolean;
  listPrice: string;
  /** Cartons on hand, per row: a count belongs to a SKU on a shelf, and one
   *  figure applied to six flavours is a number nobody counted. */
  stockCartons: string;
  staged: (StagedImage & { file: File })[];
};

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * A row per flavour on the create screen (Phase 39).
 *
 * Rendered only when there are two or more of them. With one variant its three
 * fields live in the details card above, where they have always been, so a
 * single-product create is the screen that existed before this phase — the
 * fields move rather than appearing twice.
 *
 * A card per row rather than a `<table>`: the row holds a combobox that opens
 * downward, and a table cell is the wrong container for that. The stacked card
 * is also what 390px needs, so there is one layout instead of two.
 *
 * Live upload progress is deliberately absent here. There is one upload queue
 * for the whole submit and it renders in the shared Images panel; a row's
 * disclosure shows what is staged and what was refused, which is what a reader
 * needs while filling the form in.
 */
export function VariantRows({
  rows,
  knownVariants,
  suggestedSku,
  busy,
  rejected,
  onPatch,
  onRemove,
  onFiles,
  onMoveImage,
  onRemoveImage,
}: {
  rows: VariantRowState[];
  knownVariants: string[];
  suggestedSku: (row: VariantRowState) => string;
  busy: boolean;
  /** Refusals from this row's own dropzone, keyed by row. */
  rejected: Record<string, { name: string; reason: string }[]>;
  onPatch: (key: string, patch: Partial<VariantRowState>) => void;
  onRemove: (key: string) => void;
  onFiles: (key: string, files: File[]) => void;
  onMoveImage: (key: string, index: number, delta: number) => void;
  onRemoveImage: (key: string, index: number) => void;
}) {
  return (
    // `disabled` on the fieldset, so every control inside is locked while the
    // submit is in flight without each one needing to know about it.
    <fieldset className="mt-md flex flex-col gap-sm" disabled={busy}>
      <legend className="sr-only">Variants</legend>

      {rows.map((row, index) => {
        const name = row.variant?.trim() || `Variant ${index + 1}`;

        return (
          // A named group, so every control inside it — the combobox whose own
          // label is just "Variant", the tile buttons that say "Remove image
          // 1" — is announced against the flavour it belongs to rather than
          // against twenty-three identical siblings.
          <div
            key={row.key}
            role="group"
            aria-label={name}
            className="rounded-lg border border-hairline p-md"
          >
            <div className="flex items-start justify-between gap-sm">
              <p className="text-[length:var(--text-body-sm)] font-semibold text-ink">
                {name}
              </p>
              <button
                type="button"
                aria-label={`Remove ${name}`}
                title={`Remove ${name}`}
                onClick={() => onRemove(row.key)}
                className="grid size-11 shrink-0 place-items-center rounded-sm text-ink-secondary hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:text-ink-disabled sm:size-9"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="mt-sm grid gap-sm sm:grid-cols-[2fr_2fr_1fr_1fr]">
              <div className="flex flex-col gap-xxs">
                <span className={label}>Variant</span>
                <GrowingListPicker
                  label="Variant"
                  value={row.variant}
                  known={knownVariants}
                  onChange={(variant) => onPatch(row.key, { variant })}
                />
              </div>

              <div className="flex flex-col gap-xxs">
                <label htmlFor={`variant-sku-${row.key}`} className={label}>
                  SKU
                </label>
                <Input
                  id={`variant-sku-${row.key}`}
                  value={row.skuTouched ? row.sku : suggestedSku(row)}
                  // Upper-cased as typed, like the single-product form's own
                  // SKU field: two spellings of one code must not both enter.
                  onChange={(event) =>
                    onPatch(row.key, {
                      skuTouched: true,
                      sku: event.target.value.toUpperCase(),
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-xxs">
                <label htmlFor={`variant-price-${row.key}`} className={label}>
                  List price
                </label>
                <Input
                  id={`variant-price-${row.key}`}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={row.listPrice}
                  onChange={(event) => onPatch(row.key, { listPrice: event.target.value })}
                  className="tabular-nums"
                />
              </div>

              <div className="flex flex-col gap-xxs">
                <label htmlFor={`variant-stock-${row.key}`} className={label}>
                  Stock
                </label>
                <Input
                  id={`variant-stock-${row.key}`}
                  inputMode="numeric"
                  placeholder="Cartons"
                  value={row.stockCartons}
                  onChange={(event) =>
                    onPatch(row.key, { stockCartons: event.target.value })
                  }
                  className="tabular-nums"
                />
              </div>
            </div>

            <details className="mt-sm">
              <summary className="flex h-11 items-center text-[length:var(--text-body-sm)] text-brand-link">
                {row.staged.length > 0
                  ? `${row.staged.length} of its own ${row.staged.length === 1 ? "image" : "images"}`
                  : "Its own images"}
              </summary>
              <p className={`mt-xxs ${caption}`}>
                Uses the shared pictures unless you add some here.
              </p>
              <div className="mt-xs">
                <StagedImages
                  staged={row.staged}
                  rows={[]}
                  rejected={rejected[row.key] ?? []}
                  busy={busy}
                  // Not Phase 27's sentence: this set is optional, because the
                  // shared pictures cover a row that stages none.
                  note="Optional. The first is this variant's cover."
                  onFiles={(files) => onFiles(row.key, files)}
                  onMove={(at, delta) => onMoveImage(row.key, at, delta)}
                  onRemove={(at) => onRemoveImage(row.key, at)}
                />
              </div>
            </details>
          </div>
        );
      })}
    </fieldset>
  );
}
