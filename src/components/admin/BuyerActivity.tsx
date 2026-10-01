"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { TablePagination } from "@/components/portal/TablePagination";
import { FileText, LogIn, Pencil, ShoppingCart } from "lucide-react";
import { Timeline } from "@/components/arc/timeline/timeline";
import { roleLabel } from "@/lib/permissions/roles";
import { TIME_ZONE } from "@/lib/dates";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import {
  ACTIVITY_PAGE_SIZE,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/queries/buyer-activity-entries";

const FILTERS: { value: ActivityKind | "all"; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "Nothing has happened on this account yet." },
  { value: "sign-in", label: "Sign-ins", empty: "Nobody from this buyer has signed in yet." },
  { value: "shop-order", label: "Shop orders", empty: "They have not ordered on the shop." },
  { value: "purchase-order", label: "Purchase orders", empty: "No purchase orders yet." },
  { value: "change", label: "Changes", empty: "Nobody has changed this account yet." },
];

/** What a row without a portrait shows: the kind of thing that happened. */
function KindIcon({ kind }: { kind: ActivityKind }) {
  const Icon =
    kind === "sign-in"
      ? LogIn
      : kind === "shop-order"
        ? ShoppingCart
        : kind === "purchase-order"
          ? FileText
          : Pencil;
  return <Icon className="size-4" strokeWidth={1.75} aria-hidden />;
}

export function BuyerActivity({
  entries,
  total,
  kind,
  page,
  failedWindowHours,
  now,
}: {
  entries: ActivityEntry[];
  total: number;
  kind: ActivityKind | "all";
  page: number;
  failedWindowHours: number;
  /** The server's clock, so relative times and day groups hydrate as rendered. */
  now: number;
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
        // Arc's timeline: day groups, a line drawing down the rows, and the
        // actor's job beside their name — this list mixes a buyer's own
        // contacts signing in and ordering with ops staff confirming, editing
        // and advancing, and the avatar alone does not say which side of that
        // a row came from. A row that names a purchase order opens to its link.
        <Timeline
          label="Account activity"
          now={now}
          timeZone={TIME_ZONE}
          locale="en-GB"
          headingLevel={3}
          events={entries.map((entry) => ({
            id: entry.id,
            at: entry.at,
            title: entry.text,
            meta: entry.actor
              ? `${entry.actor.name} · ${roleLabel(entry.actor.role)}`
              : undefined,
            avatar: entry.actor?.image ?? undefined,
            icon: <KindIcon kind={entry.kind} />,
            detail: entry.href ? (
              <Link
                href={entry.href}
                className="text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Open it
              </Link>
            ) : undefined,
          }))}
        />
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
