"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { INTAKE_STATUS } from "@/components/portal/StatusBadge";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { Spinner } from "@/components/portal/Spinner";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";
import type { BookingChip } from "@/lib/queries/booking-confirmations";

/** Chips read the badge palette, so a colour means the same in both places. */
const CHIPS: { value: BookingChip; label: string; dot: string }[] = [
  { value: "all", label: "All", dot: "bg-ink-tertiary" },
  { value: "needs-review", label: "Needs review", dot: INTAKE_STATUS.NEEDS_REVIEW.dot },
  { value: "reviewed", label: "Reviewed", dot: INTAKE_STATUS.REVIEWED.dot },
  { value: "extracting", label: "Extracting", dot: INTAKE_STATUS.EXTRACTING.dot },
  { value: "failed", label: "Failed", dot: INTAKE_STATUS.FAILED.dot },
];

const SEARCH_DEBOUNCE_MS = 200;

/** The PO list's filter row, cut to what a booking has: search, uploader, status. */
export function BookingFilters({ uploaders }: { uploaders: { id: string; name: string }[] }) {
  const { replace } = useUrlNavigation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = (searchParams.get("status") ?? "all") as BookingChip;
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const statuses = usePendingChoice<BookingChip>(status);
  const clearing = usePendingChoice<boolean>(false);

  const hrefFor = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    // A filter change goes back to page 1.
    params.delete("page");
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };
  const set = (next: Record<string, string | null>) => replace(hrefFor(next));

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const onSearchChange = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ q: value }), SEARCH_DEBOUNCE_MS);
  };

  const hasFilters = Boolean(
    searchParams.get("q") || searchParams.get("by") || (status && status !== "all"),
  );

  return (
    <div className="mb-md flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-sm">
        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-xs top-1/2 size-4 -translate-y-1/2 text-ink-tertiary"
            aria-hidden
          />
          <Input
            aria-label="Search booking confirmations"
            placeholder="Booking no., port, vessel, carrier…"
            value={query}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-control-md w-full pl-xl sm:h-control-sm"
          />
        </div>

        <select
          aria-label="Uploaded by"
          className="h-control-md rounded-sm border border-hairline-strong bg-transparent px-xs text-[length:var(--text-body-md)] text-ink focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-focus sm:h-control-sm sm:text-[length:var(--text-body-sm)]"
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

        <div
          className="flex flex-wrap items-center gap-xxs lg:ml-auto"
          aria-busy={statuses.pending || undefined}
        >
          {CHIPS.map((chip) => (
            <ChoiceButton
              key={chip.value}
              look="chip"
              selected={statuses.value === chip.value}
              pending={statuses.isPending(chip.value)}
              dimmed={statuses.pending && !statuses.isPending(chip.value)}
              onClick={() =>
                statuses.choose(chip.value, hrefFor({ status: chip.value === "all" ? null : chip.value }))
              }
            >
              <span aria-hidden className={`size-1.5 rounded-full ${chip.dot}`} />
              {chip.label}
            </ChoiceButton>
          ))}
        </div>
      </div>

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            // The input is local state: clearing the URL alone leaves the box
            // showing a search it no longer runs.
            if (timer.current) clearTimeout(timer.current);
            setQuery("");
            clearing.choose(true, hrefFor({ q: null, by: null, status: null }));
          }}
          className="inline-flex min-h-control-md items-center gap-xxs self-start text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
        >
          {clearing.pending ? <Spinner /> : <X className="size-3.5" strokeWidth={2} aria-hidden />}
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
