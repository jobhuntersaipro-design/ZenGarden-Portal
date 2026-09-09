/**
 * Loads the customer's inventory master list into the catalog.
 *
 *   npx tsx --env-file=.env.local scripts/import-catalog.ts <file.xlsx> [options]
 *
 *   --sheet <name>        worksheet to read (default: the first)
 *   --columns A,B,C       the brand, block and variant columns (default A,B,C)
 *   --labels <file.json>  read {brand, block, variant} rows from JSON instead
 *                         of a workbook — used for the 2026-09-09 import, whose
 *                         source was a one-page PDF print of the sheet rather
 *                         than the workbook (its columns were rebuilt from the
 *                         PDF's own cell borders). Same parser either way.
 *   --dry-run             print the products the sheet yields and write nothing
 *   --replace-demo        delete the landscaping demo data first (products,
 *                         their line items' purchase orders, documents and
 *                         extractions) — the 2026-09-08 decision for production
 *
 * Every imported product lands with `needsReview: true` and a list price of
 * 0.00, because the sheet carries no prices: the catalog's *Needs review* chip
 * is then the worklist for pricing them. No ProductPrice row is written for a
 * zero price — the trend would otherwise start from nothing.
 *
 * Re-running is safe: products are matched by SKU and updated in place, so a
 * corrected sheet fixes names without duplicating rows. A price somebody has
 * already set is never overwritten.
 */
import { readFileSync } from "node:fs";
import { readFile, utils } from "xlsx";
import { Prisma } from "@/generated/prisma/client";
import {
  readLabelColumns,
  toProducts,
  type SheetLabels,
} from "@/lib/catalog-import";
import { prisma } from "@/lib/prisma";

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const DEMO_SKU_PREFIXES = ["SCR-", "STN-", "PLT-", "FUR-", "DEC-", "DEK-", "STR-", "WAT-"];

async function replaceDemo() {
  const demo = await prisma.product.findMany({
    where: { OR: DEMO_SKU_PREFIXES.map((prefix) => ({ sku: { startsWith: prefix } })) },
    select: { id: true, sku: true },
  });
  if (demo.length === 0) {
    console.log("No landscaping demo products found — nothing to replace.");
    return;
  }
  const orders = await prisma.purchaseOrder.findMany({
    where: { lineItems: { some: { productId: { in: demo.map((p) => p.id) } } } },
    select: { id: true, documentId: true },
  });
  console.log(
    `Deleting ${demo.length} demo products and the ${orders.length} purchase orders that reference them…`,
  );
  await prisma.$transaction(async (tx) => {
    // Line items and stage events cascade from the order; the document and
    // its extraction are demo rows too and go with it.
    await tx.purchaseOrder.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await tx.document.deleteMany({
      where: { id: { in: orders.map((o) => o.documentId).filter(Boolean) as string[] } },
    });
    await tx.product.deleteMany({ where: { id: { in: demo.map((p) => p.id) } } });
  });
}

function labelsFromWorkbook(file: string): SheetLabels[] | null {
  const letters = (flag("columns") ?? "A,B,C").split(",");
  const [brand, block, variant] = letters.map((l) =>
    utils.decode_col(l.trim().toUpperCase()),
  );
  const workbook = readFile(file);
  const sheetName = flag("sheet") ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.error(`No sheet named "${sheetName}". Sheets: ${workbook.SheetNames.join(", ")}`);
    return null;
  }
  console.log(`Sheet "${sheetName}"`);
  return readLabelColumns(sheet, { brand, block, variant });
}

async function main() {
  const labelsFile = flag("labels");
  const file = process.argv[2];
  if (!labelsFile && (!file || file.startsWith("--"))) {
    console.error("Give me the .xlsx to import: scripts/import-catalog.ts <file.xlsx>");
    process.exitCode = 1;
    return;
  }
  const dryRun = process.argv.includes("--dry-run");

  const labels = labelsFile
    ? (JSON.parse(readFileSync(labelsFile, "utf8")) as SheetLabels[])
    : labelsFromWorkbook(file);
  if (!labels) {
    process.exitCode = 1;
    return;
  }

  const { products, duplicates, skipped } = toProducts(labels);
  console.log(`${labels.length} label rows -> ${products.length} products`);
  if (skipped.length > 0) {
    const rows = skipped.reduce((sum, s) => sum + s.rows, 0);
    console.log(
      `\n${skipped.length} blocks (${rows} rows) nest a sub-table in the variant column ` +
        `and need entering by hand:`,
    );
    console.table(skipped);
  }
  if (duplicates.length > 0) {
    console.log(`\n${duplicates.length} rows could not be given a unique SKU and were NOT imported:`);
    console.table(duplicates);
  }
  console.table(
    products.map((p) => ({
      sku: p.sku,
      brand: p.brand,
      market: p.market ?? "",
      name: p.name,
      category: p.category,
      pack: p.packSize ?? "",
    })),
  );
  if (dryRun) return;

  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  if (process.argv.includes("--replace-demo")) await replaceDemo();

  let created = 0;
  let updated = 0;
  for (const p of products) {
    const data = {
      name: p.name,
      brand: p.brand,
      variant: p.variant,
      packSize: p.packSize,
      market: p.market,
      category: p.category,
      unit: p.unit,
    };
    const existing = await prisma.product.findUnique({ where: { sku: p.sku }, select: { id: true } });
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.product.create({
        data: { ...data, sku: p.sku, listPrice: new Prisma.Decimal(0), needsReview: true },
      });
      created++;
    }
  }
  console.log(`Created ${created}, updated ${updated}. Price them from the Needs review chip.`);
}

main().finally(() => prisma.$disconnect());
