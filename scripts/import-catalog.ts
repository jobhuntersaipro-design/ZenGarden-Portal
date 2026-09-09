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
 *   --merge <file.json>   {"EXISTING-SKU": "IMPORTED-SKU"} — enrich the existing
 *                         product from the sheet instead of creating the
 *                         imported one beside it. Production's catalogue already
 *                         held products auto-created from real purchase orders,
 *                         carrying the codes the customer prints on their own
 *                         documents; those codes are what `resolveProducts`
 *                         matches, so they are the ones that must survive.
 *   --replace-demo        delete the seeded demo data first — products, their
 *                         purchase orders and those orders' documents. Seeded
 *                         rows are identified by their id prefix, never by SKU:
 *                         the seed mints `prd…`/`po…`/`doc…` while everything
 *                         the app creates is a cuid, so nothing a person
 *                         entered can be caught by it. Refuses outright if a
 *                         real order turns out to reference a seeded product.
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

/**
 * `prisma/seed.ts` mints ids as `rng.id("prd")` and friends; everything the
 * running app creates gets a Prisma cuid. So the prefix says, exactly, whether
 * a row is demo data — unlike a SKU, which a person could have typed.
 */
const SEEDED = /^(prd|po|byr|doc|ext|img|prc|usr|lin|evt)/;

async function replaceDemo(dryRun: boolean) {
  const products = await prisma.product.findMany({ select: { id: true, sku: true, name: true } });
  const demo = products.filter((p) => SEEDED.test(p.id));
  if (demo.length === 0) {
    console.log("No seeded demo products — nothing to replace.");
    return true;
  }
  const demoIds = new Set(demo.map((p) => p.id));

  const orders = await prisma.purchaseOrder.findMany({
    where: { lineItems: { some: { productId: { in: [...demoIds] } } } },
    select: { id: true, poNumber: true, documentId: true },
  });

  // The check that matters: a purchase order somebody confirmed must never be
  // deleted because a seeded product happens to appear on it.
  const realOrders = orders.filter((o) => !SEEDED.test(o.id));
  if (realOrders.length > 0) {
    console.error(
      `REFUSING: ${realOrders.length} real purchase orders reference a seeded product ` +
        `(${realOrders.map((o) => o.poNumber).join(", ")}). Sort those out by hand first.`,
    );
    return false;
  }

  console.log(
    `Demo data to remove: ${demo.length} products, ${orders.length} purchase orders and their documents.`,
  );
  if (dryRun) return true;

  await prisma.$transaction(async (tx) => {
    // Line items and stage events cascade from the order; the document and its
    // extraction are seeded rows too and go with it.
    await tx.purchaseOrder.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await tx.document.deleteMany({
      where: { id: { in: orders.map((o) => o.documentId).filter(Boolean) as string[] } },
    });
    await tx.product.deleteMany({ where: { id: { in: [...demoIds] } } });
  });
  return true;
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

  // { existing SKU -> the imported SKU it is the same product as }
  const mergeFile = flag("merge");
  const merge: Record<string, string> = mergeFile
    ? JSON.parse(readFileSync(mergeFile, "utf8"))
    : {};
  const mergeTargets = new Map(Object.entries(merge).map(([from, to]) => [to, from]));

  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  if (Object.keys(merge).length > 0) {
    console.log(`\nMerging ${Object.keys(merge).length} imported products into codes already in use:`);
    console.table(Object.entries(merge).map(([keep, from]) => ({ keep, "instead of": from })));
  }

  if (process.argv.includes("--replace-demo")) {
    if (!(await replaceDemo(dryRun))) {
      process.exitCode = 1;
      return;
    }
  }
  if (dryRun) {
    console.log("\nDry run — nothing written.");
    return;
  }

  let created = 0;
  let updated = 0;
  let merged = 0;
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

    // A product already in the catalogue under the customer's own code: keep
    // the code and the name a reviewer sees on the document, and take from the
    // sheet only what the sheet actually knows.
    const mergeInto = mergeTargets.get(p.sku);
    if (mergeInto) {
      const target = await prisma.product.findUnique({
        where: { sku: mergeInto },
        select: { id: true },
      });
      if (!target) {
        console.error(`  merge target ${mergeInto} is not in this database — skipping ${p.sku}`);
        continue;
      }
      await prisma.product.update({
        where: { id: target.id },
        data: {
          brand: p.brand,
          variant: p.variant,
          packSize: p.packSize,
          market: p.market,
          category: p.category,
          unit: p.unit,
        },
      });
      merged++;
      continue;
    }

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
  console.log(
    `Created ${created}, updated ${updated}, merged ${merged}. Price them from the Needs review chip.`,
  );
}

main().finally(() => prisma.$disconnect());
