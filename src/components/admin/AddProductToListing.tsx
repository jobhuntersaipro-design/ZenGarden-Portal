"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addProductToFamily } from "@/actions/product-families";
import { Combobox } from "@/components/review/Combobox";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";

/**
 * Puts an existing product into this listing (Phase 40). Searchable by SKU
 * or name, because the reader is looking for a row they know exists, not
 * browsing.
 */
export function AddProductToListing({
  familyId,
  candidates,
}: {
  familyId: string;
  candidates: {
    id: string;
    sku: string;
    name: string;
    brand: string | null;
    variant: string | null;
    market: string | null;
    /** The listing it is in today, if any — said up front so choosing it
     *  here is never a silent move out of that one. */
    familyName: string | null;
  }[];
}) {
  const refresh = useAwaitableRefresh();
  const [pending, setPending] = useState(false);

  const options = candidates.map((product) => {
    const facts = [product.brand, product.variant, product.market].filter(Boolean).join(" · ");
    const parts = [facts, product.familyName ? `in ${product.familyName}` : null].filter(Boolean);
    return { id: product.id, label: `${product.sku} · ${product.name}`, hint: parts.join(" · ") };
  });

  return (
    <div className="flex flex-col gap-xxs">
      <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
        Add a product
      </span>
      <Combobox
        ariaLabel="Add a product to this listing"
        value={null}
        placeholder={pending ? "Adding…" : "Search by SKU or name"}
        options={options}
        onSelect={async (option) => {
          setPending(true);
          const result = await addProductToFamily(option.id, familyId);
          if (!result.success) toast.error(result.error);
          await refresh();
          setPending(false);
        }}
      />
      <p className="text-[length:var(--text-caption)] text-ink-tertiary">
        It joins the market section its own market names.
      </p>
    </div>
  );
}
