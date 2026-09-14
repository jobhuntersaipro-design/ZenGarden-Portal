/**
 * Fills in `Product.cartonsPerPallet` from the inventory sheet the catalogue
 * was imported from.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-cartons-per-pallet.ts \
 *     docs/imports/zen-garden-dc-inventory-2026.labels.json --dry-run
 *
 *   --dry-run   print what would change and write nothing
 *
 * The number was always in the sheet — "ZEN 1L (12) 52CTNS/PALLET" — and the
 * importer parsed it out of the product's name and threw it away until Phase
 * 29. This re-reads the same labels file through the same parser and writes
 * what it finds.
 *
 * **Matched by exact SKU, never fuzzily.** `toProducts` regenerates each row's
 * SKU the way the import did, and only a product whose code is still that
 * string is updated. A code somebody has edited by hand since simply will not
 * match, and is reported rather than guessed at — the 2026-09-09 import's own
 * rule, for the same reason: the customer's printed codes are what
 * `resolveProducts` matches, and a wrong guess here would be invisible.
 *
 * A product that already carries a figure is left alone: somebody typed it,
 * and the sheet is not a better source than a person who looked at the pallet.
 */
import { readFileSync } from "node:fs";
import { toProducts, type SheetLabels } from "@/lib/catalog-import";
import { prisma } from "@/lib/prisma";

function host(url: string | undefined): string {
  return url?.match(/@([^/?]+)/)?.[1] ?? "unknown";
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error(
      "Give me the labels file:\n" +
        "  npx tsx --env-file=.env.local scripts/backfill-cartons-per-pallet.ts " +
        "docs/imports/zen-garden-dc-inventory-2026.labels.json --dry-run",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  console.log(dryRun ? "Dry run — nothing will be written.\n" : "Writing.\n");

  const labels = JSON.parse(readFileSync(file, "utf8")) as SheetLabels[];
  const { products } = toProducts(labels);
  const withPallet = products.filter((p) => p.cartonsPerPallet !== null);
  console.log(
    `${labels.length} label rows -> ${products.length} products, ` +
      `${withPallet.length} of them carrying a pallet count.`,
  );

  let updated = 0;
  let already = 0;
  const unmatched: { sku: string; name: string; cartons: number }[] = [];

  for (const product of withPallet) {
    const existing = await prisma.product.findUnique({
      where: { sku: product.sku },
      select: { id: true, cartonsPerPallet: true },
    });
    if (!existing) {
      unmatched.push({
        sku: product.sku,
        name: product.name,
        cartons: product.cartonsPerPallet!,
      });
      continue;
    }
    if (existing.cartonsPerPallet !== null) {
      already++;
      continue;
    }
    if (!dryRun) {
      await prisma.product.update({
        where: { id: existing.id },
        data: { cartonsPerPallet: product.cartonsPerPallet },
      });
    }
    updated++;
  }

  console.log(
    `\n${dryRun ? "Would set" : "Set"} ${updated} products; ` +
      `${already} already had a figure; ${unmatched.length} sheet rows matched no product.`,
  );
  if (unmatched.length > 0) {
    console.log("\nNo product carries these codes — enter them by hand if they matter:");
    for (const row of unmatched.slice(0, 40)) {
      console.log(`  ${row.sku}  ${row.cartons}/pallet  ${row.name}`);
    }
    if (unmatched.length > 40) console.log(`  … and ${unmatched.length - 40} more`);
  }
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
