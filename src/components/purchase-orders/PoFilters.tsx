"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { INTAKE_STATUS } from "@/components/portal/StatusBadge";
import { PO_STAGES, stageLabel } from "@/lib/po-stages";

export type StatusChip =
  | "all"
  | "confirmed"
  | "needs-review"
  | "extracting"
  | "failed";

/**
 * Chips and badges read the same tokens, so a colour means the same thing in
 * the filter row and in the table under it (00-master.md §4).
 */
const CHIPS: { value: StatusChip; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-ink-tertiary" },
  { value: "confirmed", label: "Confirmed", dot: "bg-accent-green" },
  { value: "needs-review", label: "Needs review", dot: INTAKE_STATUS.NEEDS_REVIEW.dot },
  { value: "extracting", label: "Extracting", dot: INTAKE_STATUS.EXTRACTING.dot },
  { value: "failed", label: "Failed", dot: INTAKE_STATUS.FAILED.dot },
];

const SEARCH_DEBOUNCE_MS = 200;

export function PoFilters({
  buyers,
  uploaders,
  needsReview,
}: {
  buyers: { id: string; name: string }[];
  uploaders: { id: string; name: string }[];
  needsReview: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") ?? "all") as StatusChip;
  const stage = searchParams.get("stage") ?? "";
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const set = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // Every filter change goes back to page 1: page 7 of a longer result set
    // is usually past the end of a shorter one.
    params.delete("page");
    router.replace(
      params.toString() ? `${pathname}?${params.toString()}` : pathname,
      { scroll: false },
    );
  };

  /**
   * Debounced in the change handler rather than in an effect. An effect here
   * would close over `set`, and `set` closes over `searchParams` — so every
   * navigation would restart the timer with stale params.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onSearchChange = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q: value }), SEARCH_DEBOUNCE_MS);
  };

  // The stage filter only means anything for rows that have a stage.
  const stageDisabled = status !== "all" && status !== "confirmed";
  const hasFilters = Boolean(
    searchParams.get("q") ||
      searchParams.get("buyer") ||
      searchParams.get("by") ||
      searchParams.get("stage") ||
      (status && status !== "all"),
  );

  const select =
    "h-control-sm rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-sm)] text-ink focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary disabled:text-ink-disabled";

  return (
    <div className="mb-md flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
            aria-hidden
          />
          <Input
            aria-label="Search purchase orders"
            placeholder="PO number or item…"
            value={query}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-control-sm w-72 pl-xl"
          />
        </div>

        <select
          aria-label="Buyer"
          className={select}
          value={searchParams.get("buyer") ?? ""}
          onChange={(event) => set({ buyer: event.target.value })}
        >
          <option value="">All buyers</option>
          {buyers.map((buyer) => (
            <option key={buyer.id} value={buyer.id}>
              {buyer.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Uploaded by"
          className={select}
          value={searchParams.get("by") ?? ""}
          onChange={(event) => set({ by: event.target.value })}
        >
          <option value="">Uploaded by anyone</option>
          {uploaders.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Stage"
          className={select}
          disabled={stageDisabled}
          title={stageDisabled ? "Only confirmed orders have a stage" : undefined}
          value={stage}
          onChange={(event) => set({ stage: event.target.value })}
        >
          <option value="">Any stage</option>
          {PO_STAGES.map((value) => (
            <option key={value} value={value}>
              {stageLabel(value)}
            </option>
          ))}
          <option value="not-delivered">Not delivered</option>
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-xxs">
          {CHIPS.map((chip) => {
            const active = status === chip.value;
            // The count comes from the same query that feeds the table, so a
            // row leaving the queue changes the chip on the same render.
            const count =
              chip.value === "needs-review" && needsReview > 0 ? needsReview : null;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  set({ status: chip.value === "all" ? null : chip.value })
                }
                className={`inline-flex items-center gap-xxs rounded-full px-sm py-xxs text-[length:var(--text-caption)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active
                    ? "bg-ink text-canvas"
                    : "bg-surface-soft text-ink-secondary hover:text-ink"
                }`}
              >
                <span aria-hidden className={`size-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                {count !== null ? (
                  <span className="tabular-nums font-medium">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            // The input is local state, so clearing the URL is not enough —
            // without this the box keeps showing the search it no longer runs.
            if (timer.current) clearTimeout(timer.current);
            setQuery("");
            set({ q: null, buyer: null, by: null, stage: null, status: null });
          }}
          className="self-start text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          ✕ Clear filters
        </button>
      ) : null}
    </div>
  );
}
