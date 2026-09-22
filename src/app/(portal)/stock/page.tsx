import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { StockActivityFeed } from "@/components/stock/StockActivityFeed";
import { StockSheet } from "@/components/stock/StockSheet";
import { requirePermission } from "@/lib/permissions/require";
import { firstParam, type SearchParams } from "@/lib/queries/pagination";
import { loadStockFeed, loadStockSheet } from "@/lib/queries/stock";
import { TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: "Stock · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/** Today in Kuala Lumpur, which is the day a counter means by "today". */
const todayKL = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("product.view");
  const params = await searchParams;
  const q = firstParam(params, "q")?.trim() || undefined;
  const product = firstParam(params, "product") ?? undefined;

  const [rows, feed] = await Promise.all([loadStockSheet(q), loadStockFeed(20)]);

  const counted = rows.filter((row) => row.lastCountedOn !== null).length;

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Stock" />

      <p className={`mb-lg ${caption}`}>
        {counted} of {rows.length} products counted · every count keeps who
        counted it, the day it counts and what they said.
      </p>

      <StockSheet rows={rows} today={todayKL()} focusProductId={product} />

      <section className="mt-xl rounded-lg border border-hairline bg-canvas p-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Activity
        </p>
        <h2 className="mb-xs font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
          Recent counts
        </h2>
        <StockActivityFeed rows={feed} productHref />
      </section>
    </>
  );
}
