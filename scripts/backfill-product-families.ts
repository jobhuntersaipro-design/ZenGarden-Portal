/**
 * Puts the existing products into families (docs/specs/36-product-families.md §3).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-product-families.ts --propose <out.json>
 *   npx tsx --env-file=.env.local scripts/backfill-product-families.ts --apply <in.json> [--dry-run]
 *
 * `--propose` groups every product that has no family by brand + line + size
 * (never market), proposes a code per group, writes the proposal as JSON and
 * prints a report. Wherever two groups would take the same code, `code` is
 * left `null` for a person to fill in: the same code on both groups merges
 * them into one family; a qualifier on one (`ZEN-SC-1000-SCRUB`) keeps them
 * apart. `name` may be edited too — it becomes the family's display name and
 * the shop's card title.
 *
 * `--apply` refuses while any `code` is blank or malformed, then creates one
 * family per distinct code (groups sharing a code become one family, named by
 * the first) and links products **by id**. Only products still without a
 * family are touched, so it is safe to run twice. `--dry-run` prints what it
 * would do and writes nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import {
  familyReport,
  proposeFamilies,
  type FamilyProposal,
} from "@/lib/product-families";
import { familyCodeSchema } from "@/lib/validation/product-families";

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function propose(out: string) {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      variant: true,
      category: true,
      market: true,
      needsReview: true,
      familyId: true,
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
  });
  const proposal = proposeFamilies(products);
  writeFileSync(out, JSON.stringify(proposal, null, 2));
  console.log(familyReport(proposal));
  console.log(`\nProposal written to ${out}. Edit it, then run --apply.`);
}

async function apply(file: string, dryRun: boolean) {
  const proposal = JSON.parse(readFileSync(file, "utf8")) as FamilyProposal;

  // Every group needs a well-formed code before anything is written.
  const problems: string[] = [];
  const codes = new Map<string, string>();
  for (const group of proposal.groups) {
    if (group.code === null) {
      problems.push(`${group.line}: code is blank (collided on ${group.proposedCode})`);
      continue;
    }
    const parsed = familyCodeSchema.safeParse(group.code);
    if (!parsed.success) {
      problems.push(`${group.line}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    codes.set(group.key, parsed.data);
  }
  if (problems.length > 0) {
    console.error("Refusing to apply:");
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }

  const [before, families] = await Promise.all([
    prisma.product.count({ where: { familyId: null } }),
    prisma.productFamily.count(),
  ]);
  console.log(`Before: ${before} products without a family, ${families} families.`);

  // One family per distinct code; the first group carrying it names it.
  const byCode = new Map<string, FamilyProposal["groups"]>();
  for (const group of proposal.groups) {
    const code = codes.get(group.key)!;
    byCode.set(code, [...(byCode.get(code) ?? []), group]);
  }

  for (const [code, groups] of byCode) {
    const [first] = groups;
    const productIds = groups.flatMap((g) => g.products.map((p) => p.id));
    const merged = groups.length > 1 ? ` (merging ${groups.length} groups)` : "";
    console.log(`${code}  ${first.name} · ${productIds.length} products${merged}`);
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const family = await tx.productFamily.upsert({
        where: { code },
        create: {
          code,
          name: first.name,
          brand: first.brand,
          category: first.category,
          size: first.size,
        },
        update: {},
        select: { id: true },
      });
      await tx.product.updateMany({
        where: { id: { in: productIds }, familyId: null },
        data: { familyId: family.id },
      });
    });
  }

  const [after, familiesAfter] = await Promise.all([
    prisma.product.count({ where: { familyId: null } }),
    prisma.productFamily.count(),
  ]);
  console.log(
    `${dryRun ? "Would leave" : "After:"} ${after} products without a family, ${familiesAfter} families.`,
  );
}

async function main() {
  console.log(`Database: ${host(process.env.DATABASE_URL)}`);
  const out = flag("propose");
  const input = flag("apply");
  if (out) return propose(out);
  if (input) return apply(input, process.argv.includes("--dry-run"));
  console.error("Usage: --propose <out.json> | --apply <in.json> [--dry-run]");
  process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
