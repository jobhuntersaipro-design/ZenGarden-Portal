/**
 * Copies one photograph per flavour into the SKU-named files the image
 * importer expects.
 *
 *   npx tsx scripts/fan-out-variant-images.ts <in-folder> <out-folder> [--dry-run]
 *
 * Super Indo, Lotus's and NORMAL/DIY are the same 2.1L bottle sold to three
 * different customers, so one photograph serves three products. But
 * `import-product-images.ts` matches a file to a product by its basename and
 * deliberately never guesses, so the same photograph has to exist once per
 * SKU. Doing that by hand is twenty file names to type correctly; a typo puts
 * a photograph on no product, or worse, on the wrong one.
 *
 * The input folder holds one file per flavour, named by the slugs in FLAVOURS
 * — `goats-milk.jpg`, `lavender.png`, … — in any of the extensions the image
 * importer accepts. Whatever extension a flavour's file carries is kept.
 *
 * A flavour with no file is reported and skipped, never invented: Avocado and
 * Oat Milk had no photograph anywhere public when this was written, and a
 * catalogue that shows the Carrot bottle under Avocado is worse than one that
 * shows nothing.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

/** Flavour slug → the SKUs that show that flavour's bottle. */
const FLAVOURS: Record<string, string[]> = {
  "goats-milk": ["ZEN-SC-2100-GM", "ZEN-SC-2100-GM-ID", "ZEN-SC-2100-GM-LOTUS"],
  lavender: ["ZEN-SC-2100-LV", "ZEN-SC-2100-LV-ID", "ZEN-SC-2100-LV-LOTUS"],
  papaya: ["ZEN-SC-2100-PP", "ZEN-SC-2100-PP-ID", "ZEN-SC-2100-PP-LOTUS"],
  "royal-jelly": ["ZEN-SC-2100-RJ", "ZEN-SC-2100-RJ-ID", "ZEN-SC-2100-RJ-LOTUS"],
  "green-tea": ["ZEN-SC-2100-GT", "ZEN-SC-2100-GT-ID", "ZEN-SC-2100-GT-LOTUS"],
  carrot: ["ZEN-SC-2100-CR", "ZEN-SC-2100-CR-ID", "ZEN-SC-2100-CR-LOTUS"],
  avocado: ["ZEN-SC-2100-AV"],
  "oat-milk": ["ZEN-SC-2100-OM"],
};

/** The extensions `import-product-images.ts` reads. */
const EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const [inDir, outDir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");

if (!inDir || !outDir) {
  console.error(
    "Usage: npx tsx scripts/fan-out-variant-images.ts <in-folder> <out-folder> [--dry-run]",
  );
  process.exit(1);
}

const available = new Map<string, string>();
for (const file of readdirSync(inDir)) {
  const ext = extname(file).toLowerCase();
  if (!EXTENSIONS.includes(ext)) continue;
  available.set(file.slice(0, -ext.length).toLowerCase(), file);
}

if (!dryRun && !existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let written = 0;
const missing: string[] = [];

for (const [flavour, skus] of Object.entries(FLAVOURS)) {
  const source = available.get(flavour);
  if (!source) {
    missing.push(flavour);
    continue;
  }
  const ext = extname(source).toLowerCase();
  for (const sku of skus) {
    const target = join(outDir, `${sku}${ext}`);
    console.log(`${source}  →  ${sku}${ext}`);
    if (!dryRun) copyFileSync(join(inDir, source), target);
    written += 1;
  }
}

console.log(
  `\n${dryRun ? "Would write" : "Wrote"} ${written} file${written === 1 ? "" : "s"}` +
    ` for ${Object.keys(FLAVOURS).length - missing.length} of ${Object.keys(FLAVOURS).length} flavours.`,
);

if (missing.length > 0) {
  console.log(`No photograph for: ${missing.join(", ")}`);
  console.log(
    `Name each one ${EXTENSIONS.join(" / ")} in ${inDir} — these products keep no image rather than borrow another flavour's.`,
  );
}
