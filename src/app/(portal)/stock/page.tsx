import type { Metadata } from "next";
import { PageHeader } from "@/components/portal/PageHeader";
import { TablePagination } from "@/components/portal/TablePagination";
import { CountStockDrawer } from "@/components/stock/CountStockDrawer";
import { StockActivityFeed } from "@/components/stock/StockActivityFeed";
import { StockSearch } from "@/components/stock/StockSearch";
import { StockTable } from "@/components/stock/StockTable";
import { requirePermission } from "@/lib/permissions/require";
import {
  firstParam,
  parsePagination,
  parseSort,
  type SearchParams,
} from "@/lib/queries/pagination";
import { loadStockFeed, loadStockSheet, type StockSheetRow } from "@/lib/queries/stock";
import { TIME_ZONE } from "@/lib/dates";

export const metadata: Metadata = { title: "Stock · Zen Garden Portal" };
export const dynamic = "force-dynamic";

const SORT_KEYS = ["name", "stockCartons", "lastCountedOn"] as const;

/** Today in Kuala Lumpur, which is the day a counter means by "today". */
const todayKL = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

/**
 * Blanks sink in both directions, as they do everywhere in this portal since
 * Phase 35: a product nobody has counted is not a product with none, and
 * sorting it as zero would fill the low end — the end somebody sorts to when
 * they want to know what is running out — with rows that say nothing.
 */
function selectRows(
  rows: StockSheetRow[],
  sort: { key: string; dir: "asc" | "desc" },
): StockSheetRow[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "name") return sign * a.name.localeCompare(b.name);
    const key = sort.key === "stockCartons" ? "stockCartons" : "lastCountedOn";
    const left = a[key];
    const right = b[key];
    if (left === null && right === null) return a.name.localeCompare(b.name);
    if (left === null) return 1;
    if (right === null) return -1;
    return sign * (left < right ? -1 : left > right ? 1 : 0);
  });
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requirePermission("product.view");
  const params = await searchParams;
  const q = firstParam(params, "q")?.trim() || undefined;
  const openId = firstParam(params, "product") ?? null;

  const [rows, feed] = await Promise.all([loadStockSheet(q), loadStockFeed(20)]);

  const sort = parseSort(params, SORT_KEYS, { key: "lastCountedOn", dir: "asc" });
  const selected = selectRows(rows, sort);
  const { page, size, skip, take } = parsePagination(params);
  const paged = selected.slice(skip, skip + take);

  // Read from the whole list, not the page: a drawer opened from a link must
  // not depend on which page of the table the reader happens to be on.
  const open = openId ? (rows.find((row) => row.id === openId) ?? null) : null;
  const counted = rows.filter((row) => row.lastCountedOn !== null).length;

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Stock" />

      <p className="mb-lg text-[length:var(--text-caption)] text-ink-tertiary">
        {counted} of {rows.length} products counted
        {q ? ` · matching “${q}”` : ""} · open a row to count it. Every count
        keeps who counted it, the day it counts and what they said.
      </p>

      <StockSearch initial={q ?? ""} />
      <StockTable rows={paged} sort={sort} />
      <TablePagination page={page} size={size} total={selected.length} />

      <CountStockDrawer product={open} today={todayKL()} />

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
