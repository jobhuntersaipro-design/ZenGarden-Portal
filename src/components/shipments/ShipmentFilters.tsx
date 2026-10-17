"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { DOT } from "@/components/shipments/ChecklistDots";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import { SLOT_LABEL, SLOT_ORDER } from "@/lib/shipments/checklist";
import { STATUS_LABEL, STATUS_ORDER, type ShipmentStatus } from "@/lib/shipments/due";

const SELECT =
  "h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:h-control-sm sm:text-[length:var(--text-body-sm)]";

const CHIP_DOT: Record<ShipmentStatus, string> = {
  overdue: DOT.overdue,
  due_soon: DOT.due_soon,
  no_booking: DOT.missing,
  in_progress: "bg-accent-blue border-accent-blue",
  complete: DOT.done,
};

/** Status chips with counts, then Missing, Buyer, Market, ETD and sort — all in the URL (Phase 64 §2). */
export function ShipmentFilters({
  counts,
  all,
  buyers,
  markets,
  resolved,
}: {
  counts: Record<ShipmentStatus, number>;
  all: number;
  buyers: { id: string; name: string }[];
  markets: string[];
  resolved: { status?: string; missing?: string; buyerId?: string; market?: string; etdFrom?: string; etdTo?: string; sort: string; dir: string };
}) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const statuses = usePendingChoice<string>(resolved.status ?? "all");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    return params.toString() ? `${pathname}?${params}` : pathname;
  };
  const set = (next: Record<string, string | null>) => replace(hrefFor(next));
  const has = ["q", "status", "missing", "buyer", "market", "etd_from", "etd_to"].some((k) => searchParams.get(k));

  return (
    <div className="mb-md flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-xxs" aria-busy={statuses.pending || undefined}>
        {(["all", ...STATUS_ORDER] as const).map((value) => (
          <ChoiceButton
            key={value}
            look="chip"
            selected={statuses.value === value}
            pending={statuses.isPending(value)}
            dimmed={statuses.pending && !statuses.isPending(value)}
            onClick={() => statuses.choose(value, hrefFor({ status: value === "all" ? null : value }))}
          >
            {value !== "all" ? <span aria-hidden className={`size-1.5 rounded-full border ${CHIP_DOT[value]}`} /> : null}
            {value === "all" ? "All" : STATUS_LABEL[value]}
            <span className="tabular-nums text-ink-tertiary">{value === "all" ? all : counts[value]}</span>
          </ChoiceButton>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary" aria-hidden />
          <Input
            aria-label="Search shipments"
            placeholder="Reference, buyer, PO, booking, container, vessel…"
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => set({ q: value }), 200);
            }}
            className="h-control-md w-full pl-xl sm:h-control-sm"
          />
        </div>
        <select aria-label="Missing document" className={SELECT} value={resolved.missing ?? ""} onChange={(e) => set({ missing: e.target.value })}>
          <option value="">Any document</option>
          {SLOT_ORDER.filter((k) => k !== "INVOICE").map((key) => (
            <option key={key} value={key}>
              Missing {SLOT_LABEL[key].toLowerCase()}
            </option>
          ))}
        </select>
        <select aria-label="Buyer" className={SELECT} value={resolved.buyerId ?? ""} onChange={(e) => set({ buyer: e.target.value })}>
          <option value="">Every buyer</option>
          {buyers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Market" className={SELECT} value={resolved.market ?? ""} onChange={(e) => set({ market: e.target.value })}>
          <option value="">Every market</option>
          {markets.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-xs">
          <span className="text-[length:var(--text-body-sm)] text-ink-secondary">ETD</span>
          <DateInput aria-label="ETD from" value={resolved.etdFrom ?? ""} placeholder="From" onChange={(v) => set({ etd_from: v })} className="w-40" />
          <DateInput aria-label="ETD to" value={resolved.etdTo ?? ""} placeholder="To" onChange={(v) => set({ etd_to: v })} className="w-40" />
        </div>
        <select
          aria-label="Sort"
          className={SELECT}
          value={`${resolved.sort}:${resolved.dir}`}
          onChange={(e) => {
            const [sort, dir] = e.target.value.split(":");
            set({ sort, dir });
          }}
        >
          <option value="status:asc">Status, overdue first</option>
          <option value="etd:asc">ETD, soonest first</option>
          <option value="eta:asc">ETA, soonest first</option>
          <option value="createdAt:desc">Newest first</option>
        </select>
      </div>
      {has ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            replace(pathname);
          }}
          className="inline-flex min-h-control-md items-center gap-xxs self-start text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline sm:min-h-0"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
