import type { ShopProductDetail } from "@/lib/queries/shop-catalogue";

/**
 * The `dl` under the buy box (§5.4). A row with nothing in it is left out
 * (Phase 58, reversing §5.4's "print a dash"): that rule was written for
 * staff, who fill the values in, and to a buyer "Cartons per pallet —" is a
 * question with no answer. Unit and Product code always have a value.
 */
export function ProductSpecs({ product }: { product: ShopProductDetail }) {
  const all: [string, string | null][] = [
    ["Pack size", product.packSize === null ? null : `${product.packSize} per ${product.unit}`],
    [
      "Cartons per pallet",
      product.cartonsPerPallet === null ? null : String(product.cartonsPerPallet),
    ],
    ["Unit", product.unit.charAt(0).toUpperCase() + product.unit.slice(1)],
    ["Brand", product.brand],
    ["Variant", product.variant],
    ["Market", product.market],
    ["Product code", product.sku],
  ];
  const rows = all.filter((row): row is [string, string] => Boolean(row[1]?.trim()));

  return (
    <dl>
      {rows.map(([label, value], index) => (
        <div
          key={label}
          className={`flex items-center justify-between gap-md py-sm ${
            index === rows.length - 1 ? "" : "border-b border-hairline"
          }`}
        >
          <dt className="text-[length:var(--text-caption)] text-ink-tertiary">{label}</dt>
          <dd
            className={`text-[length:var(--text-body-sm)] font-medium text-ink ${
              label === "Product code" ? "font-mono" : ""
            }`}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
