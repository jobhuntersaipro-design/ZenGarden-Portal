/**
 * Loads a folder of product photographs into the catalog.
 *
 *   npx tsx --env-file=.env.local scripts/import-product-images.ts <folder> [options]
 *
 *   --dry-run   print the match table and write nothing
 *   --replace   remove a product's existing images before adding the new ones
 *
 * Files are named by SKU. `ZEN-SC-2100-GM-MY.jpg` is the cover;
 * `ZEN-SC-2100-GM-MY-2.jpg` is the second image, and so on. The SKU is resolved
 * through `normaliseSku`, the same function the app uses, so the slashes and
 * spaces real customer codes carry resolve here exactly as they do there.
 *
 * **Unmatched files are reported, never guessed at.** Nothing is fuzzy-matched:
 * attaching a photograph to the wrong product is a mispriced order waiting to
 * happen, and nobody can see it happened.
 *
 * 309 products is not a clicking job, which is why this exists beside the
 * drag-and-drop on the product page rather than instead of it. Run `--dry-run`
 * first: the catalog importer's dry run found six defects before a single row
 * was written, three of them silent, and that is the whole reason this script
 * copies its shape.
 */
import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { deleteObject, productImageKey, productThumbKey, r2 } from "@/lib/r2";
import {
  MAX_IMAGES_PER_PRODUCT,
  isProductImageMimeType,
  type ProductImageMimeType,
} from "@/lib/validation/product-images";
import { normaliseSku } from "@/lib/validation/products";

const MIME: Record<string, ProductImageMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const has = (name: string) => process.argv.includes(`--${name}`);

/**
 * `ZEN-SC-2100-GM-MY-2.jpg` → sku `ZEN-SC-2100-GM-MY`, order 2.
 *
 * The trailing `-<n>` is only read as an ordinal when the part before it is
 * itself a known SKU; that check happens in `main`, because a code may
 * legitimately end in a number (`LHANDS-DW-1000-LE-2` is a real product).
 */
function parseName(file: string): { base: string; order: number } {
  const stem = file.slice(0, file.length - extname(file).length);
  const match = stem.match(/^(.*)-(\d+)$/);
  return match
    ? { base: normaliseSku(match[1]), order: Number(match[2]) }
    : { base: normaliseSku(stem), order: 1 };
}

async function main() {
  const folder = process.argv[2];
  if (!folder || folder.startsWith("--")) {
    console.error("Usage: import-product-images.ts <folder> [--dry-run] [--replace]");
    process.exit(1);
  }
  const dryRun = has("dry-run");
  const replace = has("replace");

  const entries = (await readdir(folder)).filter((name) =>
    Object.keys(MIME).includes(extname(name).toLowerCase()),
  );
  if (entries.length === 0) {
    console.error(`No PNG, JPG or WebP files in ${folder}`);
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true, _count: { select: { images: true } } },
  });
  const bySku = new Map(products.map((p) => [normaliseSku(p.sku), p]));

  // A code may legitimately end in a number, so the whole stem is tried as a
  // SKU before the trailing digits are read as an ordinal.
  const matched: {
    file: string;
    order: number;
    product: (typeof products)[number];
  }[] = [];
  const unmatched: string[] = [];

  for (const file of entries) {
    const stem = normaliseSku(file.slice(0, file.length - extname(file).length));
    const whole = bySku.get(stem);
    if (whole) {
      matched.push({ file, order: 1, product: whole });
      continue;
    }
    const { base, order } = parseName(file);
    const product = bySku.get(base);
    if (product) matched.push({ file, order, product });
    else unmatched.push(file);
  }

  matched.sort((a, b) =>
    a.product.sku.localeCompare(b.product.sku) || a.order - b.order,
  );

  console.log(`\n${matched.length} matched, ${unmatched.length} unmatched\n`);
  for (const row of matched) {
    console.log(
      `  ${row.file.padEnd(40)} → ${row.product.sku.padEnd(24)} #${row.order}  ${row.product.name}`,
    );
  }
  if (unmatched.length > 0) {
    console.log("\nUnmatched — no product carries these codes:");
    for (const file of unmatched) console.log(`  ${file}`);
  }

  if (dryRun) {
    console.log("\nDry run: nothing written.\n");
    return;
  }
  if (matched.length === 0) return;

  let written = 0;
  const byProduct = new Map<string, typeof matched>();
  for (const row of matched) {
    const list = byProduct.get(row.product.id) ?? [];
    list.push(row);
    byProduct.set(row.product.id, list);
  }

  for (const [productId, rows] of byProduct) {
    if (replace) {
      const old = await prisma.productImage.findMany({
        where: { productId },
        select: { id: true, r2Key: true, thumbKey: true },
      });
      for (const image of old) {
        for (const key of [image.r2Key, image.thumbKey]) {
          if (!key) continue;
          try {
            await deleteObject(key);
          } catch {
            // Best effort; the row still goes, exactly as `deleteImage` does.
          }
        }
      }
      await prisma.productImage.deleteMany({ where: { productId } });
    }

    let position = replace
      ? 0
      : await prisma.productImage.count({ where: { productId } });

    for (const row of rows) {
      if (position >= MAX_IMAGES_PER_PRODUCT) {
        console.log(`  skipped ${row.file}: ${row.product.sku} is full`);
        continue;
      }
      const ext = extname(row.file).toLowerCase();
      const mime = MIME[ext];
      if (!isProductImageMimeType(mime)) continue;

      const bytes = readFileSync(join(folder, row.file));
      const image = await prisma.productImage.create({
        data: {
          productId,
          r2Key: `pending:${productId}-${position}-${row.file}`,
          position,
          sizeBytes: bytes.byteLength,
        },
        select: { id: true },
      });
      const key = productImageKey(productId, image.id, ext);
      const thumbKey = productThumbKey(productId, image.id);

      await r2.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: mime,
        }),
      );
      // Same pipeline as the route: rotate for EXIF, fit inside 1600, WebP 82.
      const webp = await sharp(bytes)
        .rotate()
        .resize({ width: 1600, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      await r2.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: thumbKey,
          Body: webp,
          ContentType: "image/webp",
        }),
      );
      await prisma.productImage.update({
        where: { id: image.id },
        data: { r2Key: key, thumbKey },
      });

      position += 1;
      written += 1;
    }
  }

  console.log(`\nWrote ${written} images across ${byProduct.size} products.\n`);
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
