"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { TablePagination } from "@/components/portal/TablePagination";
import { PersonChip } from "@/components/ui/person";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import { formatDateTime } from "@/lib/dates";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/queries/customer-activity-entries";

const FILTERS: { value: ActivityKind | "all"; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "Nothing has happened on this account yet." },
  { value: "sign-in", label: "Sign-ins", empty: "Nobody from this customer has signed in yet." },
  { value: "shop-order", label: "Shop orders", empty: "They have not ordered on the shop." },
  { value: "purchase-order", label: "Purchase orders", empty: "No purchase orders yet." },
  { value: "change", label: "Changes", empty: "Nobody has changed this account yet." },
];

export function CustomerActivity({
  entries,
  total,
  kind,
  page,
  failedWindowHours,
}: {
  entries: ActivityEntry[];
  total: number;
  kind: ActivityKind | "all";
  page: number;
  failedWindowHours: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // `choose` navigates itself, so this hook is the only URL writer here.
  const choice = usePendingChoice<ActivityKind | "all">(kind);

  const hrefFor = (value: ActivityKind | "all") => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("kind");
    else params.set("kind", value);
    // A filter change starts a new list, so it starts at its first page.
    params.delete("page");
    return params.toString() ? `${pathname}?${params.toString()}` : pathname;
  };

  const showsFailures = kind === "all" || kind === "sign-in";

  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <h2 className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Activity
        </h2>
        <SegmentGroup label="Filter activity" hideLabel busy={choice.pending}>
          {FILTERS.map((filter) => (
            <ChoiceButton
              key={filter.value}
              look="segment"
              compact
              selected={choice.value === filter.value}
              pending={choice.isPending(filter.value)}
              dimmed={choice.pending && !choice.isPending(filter.value)}
              onClick={() => choice.choose(filter.value, hrefFor(filter.value))}
            >
              {filter.label}
            </ChoiceButton>
          ))}
        </SegmentGroup>
      </div>

      {entries.length === 0 ? (
        <p className="text-[length:var(--text-body-sm)] text-ink-tertiary">
          {FILTERS.find((filter) => filter.value === kind)?.empty}
        </p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-xs border-b border-hairline py-xs last:border-0"
            >
              <span className="shrink-0 font-mono text-[length:var(--text-caption)] text-ink-tertiary">
                {formatDateTime(entry.at)}
              </span>
              {entry.actor ? (
                <PersonChip name={entry.actor.name} image={entry.actor.image} />
              ) : null}
              <span className="min-w-0 flex-1 text-[length:var(--text-body-sm)] text-ink">
                {entry.href ? (
                  <Link
                    href={entry.href}
                    className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    {entry.text}
                  </Link>
                ) : (
                  entry.text
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {showsFailures ? (
        // Said, not implied: this list is not the whole story, and the reader
        // would otherwise read an empty stretch as "nothing was tried".
        <p className="mt-sm text-[length:var(--text-caption)] text-ink-tertiary">
          Failed sign-ins are kept for {failedWindowHours} hours. Everything else is kept
          indefinitely.
        </p>
      ) : null}

      {total > ACTIVITY_PAGE_SIZE ? (
        <div className="mt-md">
          <TablePagination
            page={page}
            size={ACTIVITY_PAGE_SIZE}
            total={total}
            sizes={[ACTIVITY_PAGE_SIZE]}
          />
        </div>
      ) : null}
    </section>
  );
}
