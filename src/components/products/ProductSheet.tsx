"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateProduct } from "@/actions/products";
import { FamilyPicker, type FamilyChoice } from "@/components/products/FamilyPicker";
import { GrowingListPicker } from "@/components/products/GrowingListPicker";
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
import { familyFromDraft } from "@/lib/product-families";
import type { FamilyOption } from "@/lib/queries/product-families";
import type { GrowingLabel } from "@/lib/queries/products";
import type { ProductInput } from "@/lib/validation/products";

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

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
            <FamilyPicker
              families={families}
              value={family}
              brand={form.brand ?? null}
              category={form.category}
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
                value={form.sku}
                // Upper-cased as typed, so two people cannot enter the same SKU
                // two ways and create a duplicate the schema would reject.
                onChange={(event) =>
                  set("sku", event.target.value.toUpperCase())
                }
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Capitals, digits and dashes
              </p>
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
              disabled={imageCount === 0}
              pending={pending}
              onClick={async () => {
                setPending(true);
                const result = await updateProduct(product.id, {
                  ...form,
                  familyId: family.familyId,
                  newFamily: family.draft
                    ? familyFromDraft(family.draft, {
                        brand: form.brand ?? null,
                        category: form.category,
                      })
                    : null,
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
