import { prisma } from "@/lib/prisma";
async function main() {
  console.log("=== counts ===");
  console.log("POs:", await prisma.purchaseOrder.count(), "| documents:", await prisma.document.count(),
              "| products:", await prisma.product.count(), "| needsReview:", await prisma.product.count({ where: { needsReview: true } }));

  console.log("\n=== newest extraction ===");
  const ex = await prisma.extraction.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, rawJson: true, document: { select: { originalName: true } } },
  });
  console.log(ex?.document.originalName, ex?.status, ex?.id);
  const raw = ex?.rawJson as { lineItems?: { description: string; sku: string | null }[] } | null;
  console.log("extracted lines (description | sku):");
  for (const l of raw?.lineItems ?? []) console.log("   ", JSON.stringify(l.description), "|", JSON.stringify(l.sku));

  console.log("\n=== products created from POs ===");
  for (const p of await prisma.product.findMany({ where: { needsReview: true }, select: { sku: true, name: true } })) {
    console.log("   ", p.sku, "|", p.name);
  }
  await prisma.$disconnect();
}
main();
