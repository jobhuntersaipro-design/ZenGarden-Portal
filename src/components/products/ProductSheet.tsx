"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/actions/products";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_CATEGORIES } from "@/lib/product-categories";
import type { ProductInput } from "@/lib/validation/products";

const BLANK: ProductInput = {
  name: "",
  sku: "",
  category: PRODUCT_CATEGORIES[0],
  unit: "",
  listPrice: "",
  description: null,
  active: true,
};

/**
 * Create and edit. Images are not here yet — the upload path needs R2, which
 * is not configured, and shipping an editor nobody can run would be worse than
 * saying so (see context/current-feature.md).
 */
export function ProductSheet({
  product,
  trigger,
}: {
  product?: ProductInput & { id: string };
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductInput>(product ?? BLANK);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{product ? "Edit product" : "New product"}</SheetTitle>
          <SheetDescription>
            Images are added once storage is configured.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
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
                className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {PRODUCT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
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

          <label className="flex items-center gap-xs text-[length:var(--text-body-sm)] text-ink">
            <Switch
              checked={form.active}
              onCheckedChange={(value) => set("active", value === true)}
            />
            Active
          </label>

          <div className="flex flex-wrap items-center gap-sm">
            <Button
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const result = product
                  ? await updateProduct(product.id, form)
                  : await createProduct(form);
                setPending(false);
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                toast.success(product ? "Product saved" : "Product created");
                router.refresh();
              }}
            >
              {pending ? "Saving…" : product ? "Save changes" : "Create product"}
            </Button>

            {product && form.active ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  const result = await archiveProduct(product.id);
                  setPending(false);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setOpen(false);
                  // Archiving keeps every line item that references it.
                  toast.success("Product archived");
                  router.refresh();
                }}
              >
                Archive
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
