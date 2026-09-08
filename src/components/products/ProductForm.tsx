"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { toast } from "sonner";
import { createProduct } from "@/actions/products";
import { MarketPicker } from "@/components/products/MarketPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import type { ProductInput } from "@/lib/validation/products";

/**
 * Malaysia is the home market and the common case, so it is the starting
 * value rather than a blank the reader has to fill in every time. It is a
 * default, not an assertion: "No market" is the first option in the picker.
 */
const BLANK: ProductInput = {
  name: "",
  sku: "",
  category: PRODUCT_CATEGORIES[0],
  unit: "",
  market: "Malaysia",
  listPrice: "",
  description: null,
  active: true,
};

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

const select =
  "h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Creating a product, shaped like the product it will become.
 *
 * The chrome, the two-column band and the field order all come from
 * `/products/[id]` — the name sits where the name will sit, the list price
 * where the list price will sit — so the screen you fill in is the screen you
 * read afterwards. What is deliberately absent is everything downstream of a
 * sale: the six KPI tiles, the price trend, who-buys-it, bought-together and
 * the order history. A product that does not exist yet has no history, and six
 * em-dash tiles above an empty chart would be furniture rather than
 * information.
 *
 * Editing stays in `ProductSheet`. A drawer is right for changing one field on
 * a product you are already looking at; a page is right for entering eight.
 */
export function ProductForm({ markets }: { markets: string[] }) {
  const { pending: navigating, push } = useUrlNavigation();
  const [form, setForm] = useState<ProductInput>(BLANK);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // The eyebrow reads exactly as the detail page's does, filling in as the
  // fields are typed, so the placeholders show what each one becomes.
  const eyebrow = `${form.sku || "SKU"} · ${form.category} · per ${form.unit || "unit"}`;

  // Held through the redirect as well as the write: releasing it the moment
  // the action returns would spin the button down while the detail page is
  // still being fetched, which is the failure the avatar work ran into.
  const busy = saving || navigating;

  const submit = async () => {
    setSaving(true);
    const result = await createProduct(form);
    if (!result.success) {
      setSaving(false);
      toast.error(result.error);
      return;
    }
    toast.success("Product created");
    push(`/products/${result.data.id}`);
  };

  return (
    <>
      {/* Not `PageHeader`: the title here is the Name field rather than text,
          and an `<input>` cannot live inside its `<h1>`. Everything else about
          the row — the wrap, the `min-w-0`, the eyebrow — is copied from it so
          the two headers line up. */}
      <header className="mb-lg flex flex-col items-stretch gap-md sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-md sm:gap-y-sm">
        <div className="min-w-0 flex-1">
          <p className={label}>{eyebrow}</p>
          <h1 className="sr-only">New product</h1>
          <Input
            aria-label="Product name"
            placeholder="Product name"
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
            className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-heading-md)] leading-[1.2] font-[650] tracking-[-0.91px] text-ink placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 sm:text-[length:var(--text-display-md)] sm:tracking-[-1.36px] md:text-[length:var(--text-display-md)]"
          />
        </div>
        <Button pending={busy} onClick={submit} className="self-start sm:shrink-0">
          {busy ? "Creating…" : "Create product"}
        </Button>
      </header>

      <div className="grid gap-lg lg:grid-cols-[5fr_7fr]">
        {/* The gallery's slot, holding the reason it is empty. Not
            `ProductGallery` with no images: its empty state offers "Add
            images", and there is nothing here to add them to yet. */}
        <section className="flex h-32 flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-hairline-strong bg-surface p-lg text-center sm:aspect-4/3 sm:h-auto">
          <ImageOff className="size-8 text-ink-disabled" strokeWidth={1.5} aria-hidden />
          <p className="text-[length:var(--text-body-sm)] text-ink-secondary">
            No images yet
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            Images are added once storage is configured
          </p>
        </section>

        <section className="rounded-lg border border-hairline bg-canvas p-lg">
          <div className="flex flex-col gap-xxs">
            <label htmlFor="product-price" className={label}>
              List price
            </label>
            <div className="flex items-baseline gap-xs">
              <span className="font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink-tertiary">
                RM
              </span>
              <Input
                id="product-price"
                inputMode="decimal"
                placeholder="0.00"
                value={form.listPrice}
                onChange={(event) => set("listPrice", event.target.value)}
                className="h-auto rounded-none border-0 border-b border-hairline-strong px-0 py-xxs font-display text-[length:var(--text-display-md)] leading-[1.2] font-[650] tracking-[-1.36px] text-ink tabular-nums placeholder:text-ink-disabled focus-visible:border-focus focus-visible:ring-0 md:text-[length:var(--text-display-md)]"
              />
            </div>
            <p className="text-[length:var(--text-caption)] text-ink-tertiary">
              Recorded as the first entry in this product&rsquo;s price history
            </p>
          </div>

          <div className="mt-md flex flex-col gap-xxs">
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

          {/* The positions the detail page's `dl` uses, as controls. */}
          <div className="mt-md grid gap-md sm:grid-cols-2">
            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-sku" className={label}>
                SKU
              </label>
              <Input
                id="product-sku"
                value={form.sku}
                // Upper-cased as typed, so two people cannot enter the same SKU
                // two ways and create a duplicate the schema would reject.
                onChange={(event) => set("sku", event.target.value.toUpperCase())}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Capitals, digits and dashes
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-category" className={label}>
                Category
              </label>
              <select
                id="product-category"
                value={form.category}
                onChange={(event) =>
                  set("category", event.target.value as ProductInput["category"])
                }
                className={select}
              >
                {PRODUCT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="product-unit" className={label}>
                Unit
              </label>
              <Input
                id="product-unit"
                placeholder="piece"
                value={form.unit}
                onChange={(event) => set("unit", event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-xxs">
              <span className={label}>Market</span>
              <MarketPicker
                value={form.market ?? null}
                markets={markets}
                onChange={(market) => set("market", market)}
              />
              <p className="text-[length:var(--text-caption)] text-ink-tertiary">
                Country or customer it&rsquo;s made for — type to add one
              </p>
            </div>
          </div>

          <label className="mt-md flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Switch
              checked={form.active}
              onCheckedChange={(value) => set("active", value === true)}
            />
            Active
          </label>
        </section>
      </div>
    </>
  );
}
