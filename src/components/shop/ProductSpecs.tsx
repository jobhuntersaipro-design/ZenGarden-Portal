import type { ShopProductDetail } from "@/lib/queries/shop-catalogue";

/**
 * The `dl` under the buy box (§5.4). A null value prints "—" rather than
 * dropping the row — Pack size, Unit, Brand, Variant and Market are all
 * legitimately empty on some rows, and a reader should see the field exists
 * and simply is not set, not wonder whether it was left off by accident.
 */
export function ProductSpecs({ product }: { product: ShopProductDetail }) {
  const rows: [string, string][] = [
    [
      "Pack size",
      product.packSize === null ? "—" : `${product.packSize} per ${product.unit}`,
    ],
    ["Unit", product.unit.charAt(0).toUpperCase() + product.unit.slice(1)],
    ["Brand", product.brand ?? "—"],
    ["Variant", product.variant ?? "—"],
    ["Market", product.market ?? "—"],
    ["Product code", product.sku],
  ];

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
