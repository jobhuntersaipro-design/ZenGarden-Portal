"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAwaitableRefresh } from "@/hooks/useAwaitableRefresh";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { formatDate } from "@/lib/dates";
import type { StockSheetRow } from "@/lib/queries/stock";

const label = "font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary";
const caption = "text-[length:var(--text-caption)] text-ink-tertiary";

/**
 * One product's count: the number, the day it counts, and a note.
 *
 * Opened by `?product=<id>`, so the open drawer is in the URL and survives a
 * reload — and closing it is a navigation rather than a piece of local state
 * that the table would have to be told about.
 *
 * The day is a field rather than "now", which is the whole of "update
 * historical stock": counting Friday what you walked on Wednesday is the same
 * act, and a day that already holds a count becomes a correction naming what
 * it replaced. It goes through `saveStockCounts`, the same action the sheet
 * used, so a row cannot differ by where it was typed.
 */
export function CountStockDrawer({
  product,
  today,
}: {
  product: StockSheetRow | null;
  today: string;
}) {
  const refresh = useAwaitableRefresh();
  const { replace } = useUrlNavigation();
  const [cartons, setCartons] = useState("");
  const [countedOn, setCountedOn] = useState(today);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setCartons("");
    setNote("");
    setCountedOn(today);
    replace("/stock");
  };

  const value = cartons.trim();
  const valid = value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0;

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
            : `Counted ${Number(value).toLocaleString("en-MY")} cartons`,
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
    <Sheet open={product !== null} onOpenChange={(open) => (open ? null : close())}>
      <SheetContent className="w-full sm:max-w-panel-md">
        <SheetHeader>
          <SheetTitle>Count stock</SheetTitle>
          <SheetDescription>
            {product ? product.name : ""}
            {product?.lastCountedOn
              ? ` · last counted ${formatDate(product.lastCountedOn)}`
              : " · never counted"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-md p-md">
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
              autoFocus
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
              Save count
            </Button>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
