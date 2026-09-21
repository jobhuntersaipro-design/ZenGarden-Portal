/**
 * Reads back what the catalogue actually holds for a block of the master list.
 *
 *   npx tsx --env-file=.env.local scripts/check-catalogue-block.ts <labels.json>
 *
 * Phase 52 §7 steps 1 and 6: the read before the work, and the read after it.
 * Writes nothing, ever — this is the script you run against production without
 * thinking twice.
 *
 * It takes the same labels file the catalogue importer takes, so the two
 * cannot disagree about which products a block contains: both resolve it
 * through `toProducts`. For every SKU that file yields it reports whether the
 * row exists, its list price, its review flag, how many images it carries,
 * the family it sits in, and — the figure the whole phase turns on — whether
 * a buyer can see it in the shop.
 *
 * **Why the image count leads.** `updateProduct` refuses to save a product
 * with no images, and the list price is set in that same drawer, so a zero in
 * the images column is what is stopping a price being typed, which is what is
 * keeping the row out of the shop. Reading the three together is the only way
 * to see that chain rather than infer it.
 */
import { readFileSync } from "node:fs";
import { toProducts, type SheetLabels } from "@/lib/catalog-import";
import { prisma } from "@/lib/prisma";

const file = process.argv[2];
if (!file) {
  console.error(
    "Usage: npx tsx --env-file=.env.local scripts/check-catalogue-block.ts <labels.json>",
  );
  process.exit(1);
}

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

async function main() {
  const rows = JSON.parse(readFileSync(file, "utf8")) as SheetLabels[];
  const { products } = toProducts(rows);
  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  console.log(`${file}: ${rows.length} label rows → ${products.length} products\n`);

  const found = await prisma.product.findMany({
    where: { sku: { in: products.map((p) => p.sku) } },
    select: {
      sku: true,
      name: true,
      listPrice: true,
      active: true,
      needsReview: true,
      family: { select: { code: true } },
      _count: { select: { images: true } },
    },
  });
  const bySku = new Map(found.map((p) => [p.sku, p]));

  const table = products.map((p) => {
    const row = bySku.get(p.sku);
    if (!row) return { sku: p.sku, in: "MISSING", price: "", images: "", review: "", family: "", shop: "" };
    const price = row.listPrice.toNumber();
    return {
      sku: p.sku,
      in: "yes",
      price: price.toFixed(2),
      images: row._count.images,
      review: row.needsReview ? "needs review" : "reviewed",
      family: row.family?.code ?? "—",
      // The shop's own rule, from `summarise()` in queries/products.ts.
      shop: row.active && !row.needsReview && price > 0 ? "visible" : "hidden",
    };
  });
  console.table(table);

  const missing = table.filter((r) => r.in === "MISSING");
  const noImage = table.filter((r) => r.in === "yes" && r.images === 0);
  const unpriced = table.filter((r) => r.in === "yes" && r.price === "0.00");
  const visible = table.filter((r) => r.shop === "visible");

  console.log(
    [
      `${table.length - missing.length} of ${table.length} in the catalogue` +
        (missing.length ? ` — MISSING: ${missing.map((r) => r.sku).join(", ")}` : ""),
      `${noImage.length} with no image` +
        (noImage.length ? " — these cannot be saved from the edit drawer, so they cannot be priced" : ""),
      `${unpriced.length} at 0.00`,
      `${visible.length} visible in the shop`,
    ].join("\n"),
  );

  // A SKU the sheet yields twice would mean the importer could create a
  // duplicate; it cannot today, but the check costs one line and criterion 1
  // is about exactly that.
  const seen = new Set<string>();
  const doubled = products.map((p) => p.sku).filter((s) => seen.size === seen.add(s).size);
  if (doubled.length > 0) console.log(`\nSKUs yielded more than once: ${doubled.join(", ")}`);
}

main().finally(() => prisma.$disconnect());
