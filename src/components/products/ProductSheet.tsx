"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProduct } from "@/actions/products";
import { FamilyPicker, type FamilyChoice } from "@/components/products/FamilyPicker";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
import { ListingNotice } from "@/components/products/ListingNotice";
import { ManageLabelsLink } from "@/components/products/ManageLabelsLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { NEEDS_AN_IMAGE } from "@/lib/validation/product-images";
import { familyFromDraft, findFamilyCodeCollision } from "@/lib/product-families";
import type { FamilyOption } from "@/lib/queries/product-families";
import type { GrowingLabel } from "@/lib/queries/products";
import { generateSku, generateVariantSku, isGeneratedSku, sizeInName } from "@/lib/sku";
import { normaliseSku, type ProductInput } from "@/lib/validation/products";

/**
 * Editing an existing product. Creating one is `/products/new` — a page, not a
 * drawer, because entering eight empty fields is a task of its own, while
 * changing one field on the product you are already reading is not.
 *
 * Images are managed beside the gallery on the page behind this drawer, not in
 * it. Since Phase 27 they are also a precondition: `updateProduct` refuses a
 * product that has none, and the drawer says so and disables Save rather than
 * letting the reader fill in a form the server will reject. The panel that
 * fixes it is on the same screen, a drawer-width away.
 */
export function ProductSheet({
  product,
  imageCount,
  labels,
  families,
  trigger,
}: {
  product: ProductInput & { id: string; needsReview?: boolean };
  /** Zero means every field here is unsaveable until a picture is added. */
  imageCount: number;
  labels: Record<GrowingLabel, string[]>;
  families: FamilyOption[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductInput>(product);
  const [family, setFamily] = useState<FamilyChoice>({
    familyId: product.familyId,
    draft: null,
  });
  const [pending, setPending] = useState(false);

  /**
   * Whether the SKU field follows the other fields, from the values the
   * drawer opened with. A generated code may be regenerated; a customer's or
   * a hand-typed one is offered a button instead, never moved on its own.
   *
   * Evaluated in `reset` below and nowhere else, so the decision is still
   * made exactly once per opening: a code that was a customer's when the
   * drawer opened cannot start following edits halfway through a session,
   * and one that was generated cannot stop.
   */
  const decideSkuFollows = () =>
    isGeneratedSku({
      sku: product.sku,
      brand: product.brand ?? null,
      category: product.category,
      name: product.name,
      variant: product.variant ?? null,
      market: product.market ?? null,
      familyCode: families.find((entry) => entry.id === product.familyId)?.code ?? null,
    });
  const [skuFollows, setSkuFollows] = useState(decideSkuFollows);
  const [skuTouched, setSkuTouched] = useState(false);

  /**
   * Everything the drawer edits, back to the product as it is stored now.
   *
   * `ProductSheet` itself stays mounted when the Sheet closes — only
   * `SheetContent` unmounts — so without this a drawer closed *without*
   * saving keeps its edits, and the next Save writes them. Merely surprising
   * for the price field; dangerous for the SKU, because pressing
   * "Regenerate →" to see what a code would be and then closing would leave
   * the regenerated code in the field with nothing saying the stored code
   * differs — and a later save to change the price would rewrite one of the
   * customers' own printed codes that purchase-order extraction matches
   * exactly.
   */
  const reset = () => {
    setForm(product);
    setFamily({ familyId: product.familyId, draft: null });
    setSkuTouched(false);
    setSkuFollows(decideSkuFollows());
  };

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

  // A drafted family whose code already belongs to another one — the same
  // check `ProductForm` runs, and for the same reason: a code is built from
  // brand + category + size alone (Phase 36), so a different family *name*
  // typed here cannot disambiguate it, and this drawer opens the identical
  // "+ Create a family…" disclosure `FamilyPicker` does.
  const newFamily = family.draft
    ? familyFromDraft(family.draft, { brand: form.brand ?? null, category: form.category })
    : null;
  const familyCollision = newFamily
    ? findFamilyCodeCollision(newFamily.code, families)
    : null;
  const blockedByFamilyCollision = familyCollision !== null;

  // The code the current form values would produce — recomputed on every
  // keystroke, unlike `skuFollows` above, which is decided once. Identical
  // arithmetic to `ProductForm`'s own proposal.
  const familyCode =
    families.find((entry) => entry.id === family.familyId)?.code ?? newFamily?.code ?? null;
  const proposedSku = familyCode
    ? generateVariantSku(familyCode, { variant: form.variant ?? null, market: form.market ?? null })
    : generateSku({
        brand: form.brand ?? null,
        category: form.category,
        size: sizeInName(form.name),
        variant: form.variant ?? null,
        market: form.market ?? null,
      });

  // A generated code follows the edit until the reader types in the field;
  // any other code holds still and is offered the button below.
  const sku = skuTouched || !skuFollows ? form.sku : proposedSku;

  return (
    <Sheet
      open={open}
      // Re-initialised as it opens, not only at mount — see `reset`.
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-panel-lg">
        <SheetHeader>
          <SheetTitle>Edit product</SheetTitle>
          <SheetDescription>
            Its pictures are managed in the Images panel on the page behind
            this drawer.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
          {imageCount === 0 ? (
            <p className="rounded-sm bg-surface-soft p-sm text-[length:var(--text-caption)] text-accent-red">
              {NEEDS_AN_IMAGE} Close this and add one in the Images panel.
            </p>
          ) : null}
          {/* Its category and price were taken from the line that created it,
              so they are guesses until someone says otherwise. Saving clears
              the flag: a person has now looked. */}
          {product.needsReview ? (
            <p className="rounded-sm bg-surface-soft p-sm text-[length:var(--text-caption)] text-ink-secondary">
              Added automatically from a purchase order. Check its category and
              list price, then save.
            </p>
          ) : null}
          <div className="flex flex-col gap-xxs">
            <label htmlFor="product-name" className={label}>
              Name
            </label>
            <Input
              id="product-name"
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-xxs">
            <span className={label}>Family</span>
            <ListingNotice
              brand={form.brand ?? null}
              name={form.name}
              variant={form.variant ?? null}
              market={form.market ?? null}
              excludeId={product.id}
              chosenFamilyName={
                family.familyId
                  ? (families.find((entry) => entry.id === family.familyId)?.name ?? null)
                  : (family.draft?.name.trim() || null)
              }
              // "No family" on a product that has one is a detach, and
              // `updateProduct` honours it by re-reading the row inside its
              // own transaction. The line has to say the same thing, which
              // it cannot infer from `familyId: null` alone.
              leavingFamilyName={
                family.detach && product.familyId
                  ? (families.find((entry) => entry.id === product.familyId)?.name ?? null)
                  : null
              }
            />
            <FamilyPicker
              families={families}
              value={family}
              brand={form.brand ?? null}
              category={form.category}
              collision={familyCollision}
              onChange={setFamily}
            />
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              The product this is a variant of, across every market
            </p>
          </div>

          <div className="grid gap-md sm:grid-cols-2">
            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-sku" className={label}>
                SKU
              </label>
              <Input
                id="product-sku"
                value={sku}
                // Upper-cased as typed, so two people cannot enter the same SKU
                // two ways and create a duplicate the schema would reject.
                onChange={(event) => {
                  setSkuTouched(true);
                  set("sku", event.target.value.toUpperCase());
                }}
              />
              {skuFollows || skuTouched ? (
                <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                  {skuTouched
                    ? "Capitals, digits and dashes"
                    : "Follows the family, variant and market — type to override"}
                </p>
              ) : proposedSku !== normaliseSku(form.sku) ? (
                <div className="flex flex-wrap items-center gap-xs">
                  <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                    Not a generated code, so it stays as it is.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSkuTouched(true);
                      set("sku", proposedSku);
                    }}
                    className="h-control-md rounded-pill border border-hairline-strong px-sm text-[length:var(--text-caption)] font-semibold text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:h-control-sm"
                  >
                    Regenerate → {proposedSku}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Category</span>
              <GrowingListPicker
                label="Category"
                value={form.category}
                known={labels.category}
                required
                // Required, unlike its three siblings: "No category" would
                // fail the schema, so clearing it keeps what was there.
                onChange={(category) => set("category", category ?? form.category)}
              />
              <ManageLabelsLink />
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-price" className={label}>
                List price
              </label>
              <Input
                id="product-price"
                inputMode="decimal"
                value={form.listPrice}
                onChange={(event) => set("listPrice", event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Changing it records a price history entry — the trend keeps the
                old value
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-unit" className={label}>
                Unit
              </label>
              <Input
                id="product-unit"
                value={form.unit}
                onChange={(event) => set("unit", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-md sm:grid-cols-2">
            <div className="flex flex-col gap-xxs">
              <span className={label}>Brand</span>
              <GrowingListPicker
                label="Brand"
                value={form.brand ?? null}
                known={labels.brand}
                onChange={(brand) => set("brand", brand)}
              />
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Variant</span>
              <GrowingListPicker
                label="Variant"
                value={form.variant ?? null}
                known={labels.variant}
                onChange={(variant) => set("variant", variant)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Fragrance or formulation — type to add one
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Market</span>
              <GrowingListPicker
                label="Market"
                value={form.market ?? null}
                known={labels.market}
                onChange={(market) => set("market", market)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Country or customer it&rsquo;s made for — type to add one
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-pack" className={label}>
                Pack size
              </label>
              <Input
                id="product-pack"
                inputMode="numeric"
                value={form.packSize === null ? "" : String(form.packSize)}
                onChange={(event) => set("packSize", event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Pieces per {form.unit || "carton"}
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-pallet" className={label}>
                Cartons per pallet
              </label>
              <Input
                id="product-pallet"
                inputMode="numeric"
                value={
                  form.cartonsPerPallet === null ? "" : String(form.cartonsPerPallet)
                }
                onChange={(event) => set("cartonsPerPallet", event.target.value)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                As printed on the label — 60CTNS/PALLET
              </p>
            </div>

            {/* Stock is not a property of a product (Phase 55). It is a
                stocktake somebody took on a day, with their name and a note on
                it, so it is counted at /stock and never edited here — a figure
                changed in a drawer leaves no record of who or when. */}
            <div className="flex flex-col gap-xxs">
              <p className={label}>Stock</p>
              <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
                {form.stockCartons === null
                  ? "Not counted yet"
                  : `${form.stockCartons.toLocaleString("en-MY")} cartons`}
              </p>
              <Link
                href={`/stock?product=${product.id}`}
                className="text-[length:var(--text-caption)] font-medium text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Count stock →
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-xxs">
            <label htmlFor="product-description" className={label}>
              Description
            </label>
            <Textarea
              id="product-description"
              rows={3}
              value={form.description ?? ""}
              onChange={(event) => set("description", event.target.value)}
            />
          </div>

          {/* Publishing left this drawer in Phase 28. It is one visible act on
              the product page now — a pill and a button — rather than a switch
              a reader has to open a form to find, and "Archive" was never the
              word for what it did. The `active` field still travels with the
              form, unchanged, so a save cannot flip it by omission. */}
          <div className="flex flex-wrap items-center gap-sm">
            <Button
              disabled={imageCount === 0 || blockedByFamilyCollision}
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await updateProduct(product.id, {
                  ...form,
                  sku,
                  familyId: family.familyId,
                  newFamily,
                });
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success("Product saved");
                router.refresh();
              }}
            >
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
          {/* Same shape as `ProductForm`'s own caption: neutral text, naming
              where the real explanation lives rather than repeating it — the
              red warning itself is `FamilyPicker`'s alert, above this button
              rather than below it, hence "above" and not "below" here. */}
          {blockedByFamilyCollision ? (
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              That family code is already in use — see the note above
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
