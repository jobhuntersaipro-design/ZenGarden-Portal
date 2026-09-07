/**
 * Lists every product created automatically from a purchase order code, with
 * enough context to decide whether it is real or junk.
 *
 * Read-only. It deletes nothing — pass the codes you want gone to
 * `scripts/delete-products.ts` afterwards.
 *
 *   npx tsx --env-file=.env.local scripts/audit-auto-created-products.ts
 *
 * Point --env-file at whichever environment you mean. The connection string it
 * uses is DATABASE_URL, so check that first if you are unsure which database
 * you are about to look at — it prints the host it connected to.
 */
import { prisma } from "@/lib/prisma";

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

async function main() {
  console.log("database host:", host(process.env.DATABASE_URL));
  console.log();

  const products = await prisma.product.findMany({
    where: { needsReview: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      listPrice: true,
      category: true,
      createdAt: true,
      _count: { select: { lineItems: true } },
    },
  });

  if (products.length === 0) {
    console.log("No auto-created products. Nothing to clean up.");
    return;
  }

  console.log(`${products.length} product(s) created from purchase orders:\n`);
  for (const p of products) {
    // A product no line item references is unreachable from any order — the
    // clearest sign it came from a misread code.
    const orphan = p._count.lineItems === 0 ? "  ORPHAN — no line item uses it" : "";
    console.log(`  ${p.sku}`);
    console.log(`    name      ${p.name}`);
    console.log(`    unit      ${p.unit}   price ${p.listPrice}   category ${p.category}`);
    console.log(`    used by   ${p._count.lineItems} line item(s)${orphan}`);
    console.log(`    created   ${p.createdAt.toISOString()}`);
    console.log();
  }

  const orphans = products.filter((p) => p._count.lineItems === 0);
  console.log(`${orphans.length} of ${products.length} are orphans.`);
  if (orphans.length > 0) {
    console.log("\nTo delete just the orphans:");
    console.log(
      "  npx tsx --env-file=.env.local scripts/delete-products.ts " +
        orphans.map((p) => p.sku).join(" "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
