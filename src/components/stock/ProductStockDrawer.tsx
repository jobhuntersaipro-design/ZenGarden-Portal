"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { saveStockCounts } from "@/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Shimmer } from "@/components/portal/Skeletons";
import { StockActivityFeed } from "@/components/stock/StockActivityFeed";
import {
  setPendingStockProduct,
  usePendingStockProduct,
} from "@/components/stock/pending-product";
import { StockTrend } from "@/components/stock/StockTrend";
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { formatDate } from "@/lib/dates";
import { latestCount, type StockCountRow } from "@/lib/stock";
import type { StockSheetRow } from "@/lib/queries/stock";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

const num = (value: number) => value.toLocaleString("en-MY");

/**
 * One product's stock: what it reads now, how it has moved, who moved it, and
 * the box you type the next count into.
 *
 * Opened by `?product=<id>`, so the open panel is in the URL and survives a
 * reload — and closing it is a navigation rather than a piece of local state
 * that the table would have to be told about.
 *
 * **The reading leads and the form follows** (2026-09-22, the user's choice
 * from three offered). It was a bare form, so the one figure a counter most
 * wants while typing a new count — the last one — was on another page
 * entirely. The trend and the history are the same two components the product
 * detail page draws, reading the same `loadProductStock` rows, so a figure
 * cannot differ by which screen it is read on.
 *
 * **`autoFocus` had to go with that order.** Focusing the cartons box scrolls
 * it into view, which on a phone would have thrown the panel straight past
 * the trend the panel was opened to show — the layout undoing itself on open.
 *
 * The day is a field rather than "now", which is the whole of "update
 * historical stock": counting Friday what you walked on Wednesday is the same
 * act, and a day that already holds a count becomes a correction naming what
 * it replaced. It goes through `saveStockCounts`, the same action the sheet
 * used, so a row cannot differ by where it was typed.
 */
export function ProductStockDrawer({
  product,
  counts,
  today,
}: {
  product: StockSheetRow | null;
  /** Every count for the open product, oldest first. Empty when none is open. */
  counts: StockCountRow[];
  today: string;
}) {
  const refresh = useAwaitableRefresh();
  const { replace } = useUrlNavigation();
  const [cartons, setCartons] = useState("");
  const [countedOn, setCountedOn] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Open at once on the row just clicked, and swap to the page's own product
  // when the server answers; until then the body is a loading shape rather
  // than an empty trend under a real product's name.
  const pending = usePendingStockProduct();
  const shown = product ?? pending;
  const waiting = pending !== null && product?.id !== pending.id;
  useEffect(() => {
    if (pending && product?.id === pending.id) setPendingStockProduct(null);
  }, [pending, product]);

  const close = () => {
    setPendingStockProduct(null);
    setCartons("");
    setNote("");
    setCountedOn(today);
    replace("/stock");
  };

  const value = cartons.trim();
  const valid = value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0;
  const latest = latestCount(counts);

  const save = async () => {
    if (!product || !valid) return;
    setSaving(true);
    try {
      const result = await saveStockCounts({
        countedOn,
        note: note.trim() || null,
        entries: [{ productId: product.id, cartons: Number(value) }],
      });
      if (!result.success) toast.error(result.error);
      else {
        toast.success(
          result.data.corrected > 0
            ? `Corrected ${formatDate(countedOn)}`
            : `Counted ${num(Number(value))} cartons`,
        );
        await refresh();
        close();
      }
    } catch {
      toast.error("We couldn't reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={shown !== null} onOpenChange={(open) => (open ? null : close())}>
      <SheetContent className="w-full sm:max-w-panel-lg">
        <SheetHeader>
          <SheetTitle>{shown ? shown.name : "Stock"}</SheetTitle>
          <SheetDescription>
            {shown ? [shown.sku, shown.market].filter(Boolean).join(" · ") : ""}
          </SheetDescription>
        </SheetHeader>

        {waiting ? (
          <div className="flex flex-col gap-lg p-md" aria-busy="true">
            <span className="sr-only">Loading this product&rsquo;s counts</span>
            <div className="flex flex-col gap-xs">
              <Shimmer className="h-3 w-20" />
              <Shimmer className="h-8 w-40" />
              <Shimmer className="h-3 w-56" />
            </div>
            <Shimmer className="h-40 w-full" />
            <div className="flex flex-col gap-sm">
              <Shimmer className="h-10 w-full" />
              <Shimmer className="h-10 w-full" />
            </div>
          </div>
        ) : (
        <div className="flex flex-col gap-lg p-md">
          {/* What it reads now, which is the figure a counter is about to
              replace and which the form alone never showed. */}
          <div>
            <p className={label}>On hand</p>
            <p className="font-display text-[length:var(--text-heading-md)] font-[650] text-ink">
              {latest === null ? "Not counted yet" : `${num(latest.cartons)} cartons`}
            </p>
            <p className={caption}>
              {latest === null
                ? "Nobody has counted this product."
                : `Counted ${formatDate(latest.countedOn)}${
                    latest.countedByName ? ` by ${latest.countedByName}` : ""
                  }`}
            </p>
          </div>

          <div>
            <p className={`${label} mb-xxs`}>Daily trend</p>
            <StockTrend rows={counts} />
          </div>

          <div>
            <p className={label}>Activity</p>
            <StockActivityFeed
              rows={counts}
              emptyText="No counts yet. The first one goes in below."
            />
          </div>

          <div className="flex flex-col gap-md border-t border-hairline pt-lg">
            <p className={label}>Count stock</p>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="count-cartons" className={label}>
                Cartons counted
              </label>
              <Input
                id="count-cartons"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={cartons}
                onChange={(event) => setCartons(event.target.value)}
                className="tabular-nums"
              />
              <p className={caption}>
                Zero is a count of none. Leave it empty to count nothing at all.
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="count-date" className={label}>
                Counted on
              </label>
              <Input
                id="count-date"
                type="date"
                max={today}
                value={countedOn}
                onChange={(event) => setCountedOn(event.target.value)}
              />
              <p className={caption}>
                A day that already has a count is corrected, and both readings
                stay in the history.
              </p>
            </div>

            <div className="flex flex-col gap-xxs">
              <label htmlFor="count-note" className={label}>
                Note (optional)
              </label>
              <Textarea
                id="count-note"
                rows={3}
                maxLength={500}
                placeholder="Anything worth recording about this count"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-sm">
              <Button onClick={save} disabled={!valid} pending={saving}>
                {saving ? "Saving…" : "Save count"}
              </Button>
              <Button variant="secondary" onClick={close} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
