/**
 * Deletes products by code. Takes the codes as arguments so nothing is ever
 * deleted by a filter that might have widened since you looked:
 *
 *   npx tsx --env-file=.env.local scripts/delete-products.ts ZZZ-1 ZZZ-2
 *
 * Run `scripts/audit-auto-created-products.ts` first and delete only what you
 * saw there. A product still referenced by a line item is refused: removing it
 * would orphan a line on a real order.
 */
import { prisma } from "@/lib/prisma";

function host(url: string | undefined): string {
  const match = url?.match(/@([^/?]+)/);
  return match ? match[1] : "unknown";
}

async function main() {
  const codes = process.argv.slice(2).filter(Boolean);
  if (codes.length === 0) {
    console.error("Give me at least one product code to delete.");
    process.exitCode = 1;
    return;
  }

  console.log("database host:", host(process.env.DATABASE_URL));
  console.log("codes:", codes.join(", "));
  console.log();

  const products = await prisma.product.findMany({
    where: { sku: { in: codes } },
    select: { id: true, sku: true, name: true, _count: { select: { lineItems: true } } },
  });

  const missing = codes.filter((c) => !products.some((p) => p.sku === c));
  for (const c of missing) console.log(`  skipped ${c} — no such product`);

  const inUse = products.filter((p) => p._count.lineItems > 0);
  for (const p of inUse) {
    console.log(
      `  REFUSED ${p.sku} — ${p._count.lineItems} line item(s) reference it`,
    );
  }

  const deletable = products.filter((p) => p._count.lineItems === 0);
  for (const p of deletable) {
    await prisma.product.delete({ where: { id: p.id } });
    console.log(`  deleted ${p.sku} — ${p.name}`);
  }

  console.log(`\n${deletable.length} deleted, ${inUse.length} refused, ${missing.length} not found.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
