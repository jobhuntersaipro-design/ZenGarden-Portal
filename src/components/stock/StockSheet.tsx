"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { saveStockCounts } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { formatDate } from "@/lib/dates";
import type { StockSheetRow } from "@/lib/queries/stock";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * The stocktake: walk the shelves, type what is there, save once.
 *
 * **A blank box is not a count.** Only the products somebody filled in are
 * saved, so a sheet of three hundred products costs three rows when three were
 * counted — and leaving a box empty can never be read as zero, which is the
 * null-is-not-zero rule this column has turned on since Phase 43.
 *
 * The day is a field rather than "now": counting on Friday what you walked on
 * Wednesday is ordinary, and a count entered for a day already counted becomes
 * a correction that names what it replaced.
 */
export function StockSheet({
  rows,
  today,
  focusProductId,
}: {
  rows: StockSheetRow[];
  today: string;
  /** Arrived from a product's own page: that row leads the sheet. */
  focusProductId?: string;
}) {
  const refresh = useAwaitableRefresh();
  const [countedOn, setCountedOn] = useState(today);
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const ordered = useMemo(() => {
    if (!focusProductId) return rows;
    const first = rows.filter((row) => row.id === focusProductId);
    return [...first, ...rows.filter((row) => row.id !== focusProductId)];
  }, [rows, focusProductId]);

  const filled = Object.entries(counts).filter(([, value]) => value.trim() !== "");
  const invalid = filled.filter(([, value]) => {
    const n = Number(value);
    return !Number.isInteger(n) || n < 0;
  });

  const save = async () => {
    if (filled.length === 0 || invalid.length > 0) return;
    setSaving(true);
    try {
      const result = await saveStockCounts({
        countedOn,
        note: note.trim() || null,
        entries: filled.map(([productId, value]) => ({
          productId,
          cartons: Number(value),
        })),
      });
      if (!result.success) toast.error(result.error);
      else {
        const { saved, corrected } = result.data;
        toast.success(
          corrected > 0 ? `${saved} counted · ${corrected} corrected` : `${saved} counted`,
        );
        setCounts({});
        setNote("");
        await refresh();
      }
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <p className={label}>Stocktake</p>
      <h2 className="mb-xs font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
        Count stock
      </h2>
      <p className={caption}>
        Type what you counted and leave the rest blank — a blank box is not a
        count of zero. A day that already has a count is corrected, and both
        readings stay in the history.
      </p>

      <div className="mt-lg flex flex-wrap items-end gap-md">
        <div className="flex flex-col gap-xxs">
          <label htmlFor="stock-date" className={label}>
            Counted on
          </label>
          <Input
            id="stock-date"
            type="date"
            max={today}
            value={countedOn}
            onChange={(event) => setCountedOn(event.target.value)}
            className="w-48"
          />
        </div>
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-xxs sm:basis-0">
          <label htmlFor="stock-note" className={label}>
            Note (optional)
          </label>
          <Textarea
            id="stock-note"
            rows={1}
            maxLength={500}
            placeholder="Anything worth recording about this count"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <ul className="mt-lg flex flex-col gap-xs">
        {ordered.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-sm rounded-sm border border-hairline p-sm"
          >
            <div className="min-w-0 flex-1 basis-full sm:basis-0">
              <Link
                href={`/products/${row.id}`}
                className="block min-h-control-md truncate text-[length:var(--text-body-sm)] font-medium text-ink hover:text-brand-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
                title={row.name}
              >
                {row.name}
              </Link>
              <p className={caption}>
                {row.sku}
                {row.market ? ` · ${row.market}` : ""}
                {" · "}
                {row.lastCountedOn
                  ? `${row.stockCartons?.toLocaleString("en-MY") ?? "—"} cartons on ${formatDate(row.lastCountedOn)}`
                  : "never counted"}
              </p>
            </div>
            <Input
              aria-label={`Cartons counted for ${row.name}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              placeholder="—"
              value={counts[row.id] ?? ""}
              onChange={(event) =>
                setCounts((current) => ({ ...current, [row.id]: event.target.value }))
              }
              className="w-28 shrink-0 tabular-nums"
            />
          </li>
        ))}
      </ul>

      <div className="mt-lg flex flex-wrap items-center gap-md">
        <Button
          onClick={save}
          disabled={filled.length === 0 || invalid.length > 0}
          pending={saving}
        >
          {filled.length === 0
            ? "Nothing counted yet"
            : `Save ${filled.length} count${filled.length === 1 ? "" : "s"}`}
        </Button>
        {invalid.length > 0 ? (
          <p className="text-[length:var(--text-caption)] text-accent-red">
            A count is a whole number of cartons, 0 or more.
          </p>
        ) : null}
      </div>
    </section>
  );
}
