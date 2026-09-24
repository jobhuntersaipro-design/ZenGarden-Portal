"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ChoiceButton } from "@/components/portal/ChoiceButton";
import { SegmentGroup } from "@/components/portal/SegmentGroup";
import { MAX_SERIES, SeriesTrend } from "@/components/charts/SeriesTrend";
import { usePendingChoice } from "@/hooks/usePendingChoice";
import type { SalesMeasure } from "@/lib/analytics/sales";
import {
  TREND_SUBJECTS,
  TREND_SUBJECT_LABEL,
  type SeriesOption,
  type TrendPoint,
  type TrendSubject,
} from "@/lib/analytics/trend";
import { formatMYR } from "@/lib/money";
import { formatUnits } from "@/lib/units";

const PLURAL: Record<TrendSubject, string> = {
  market: "markets",
  buyer: "buyers",
  product: "products",
};

/**
 * One trend card for three subjects (Phase 53 §3).
 *
 * Market, buyer and product answer the same question at three grains, so they
 * share one card with a subject switch rather than stacking three
 * near-identical charts down the page — and one chart means the colour rule,
 * the picker and the axis are written once.
 *
 * The measure is *not* this card's own: it reads the `?measure=` the sales
 * card above it writes, so the page can never draw money in one chart and
 * cartons in the other without saying which.
 */
export function TrendCard({
  subject,
  measure,
  points,
  options,
  slots,
}: {
  subject: TrendSubject;
  measure: SalesMeasure;
  points: TrendPoint[];
  options: SeriesOption[];
  slots: string[];
}) {
  const subjects = usePendingChoice<TrendSubject>(subject);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const noun = PLURAL[subject];
  const selected = slots.filter(Boolean).length;

  const hrefFor = (next: TrendSubject) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("trend", next);
    // A buyer id means nothing to the market subject, so the selection goes
    // rather than being carried across and silently dropped.
    params.delete("series");
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  };

  const money = measure === "sales";

  return (
    <SeriesTrend
      points={points}
      options={options}
      slots={slots}
      param="series"
      eyebrow="Trend"
      heading={`${selected} of ${options.length} ${noun}`}
      caption={`${money ? "Sales" : "Cartons"} per period · pick up to ${MAX_SERIES} ${noun}`}
      pickerCaption={`${noun[0].toUpperCase()}${noun.slice(1)} in range · pick up to ${MAX_SERIES}`}
      capWarningText={`Up to ${MAX_SERIES} ${noun} at a time — deselect one first`}
      emptyText={`Pick a ${subject} to see its trend.`}
      chooseLabel={`Choose ${noun}`}
      selectedLabel={(count) =>
        count === 1 ? `1 ${subject} selected` : `${count} ${noun} selected`
      }
      formatValue={(value) =>
        money ? formatMYR(value.toFixed(2)) : `${formatUnits(value)} cartons`
      }
      // Whole numbers: a figure beside a point is read at a glance, and
      // `RM 85,231.47` over `RM 85,110.02` is two decimals of noise between
      // the only digits that differ.
      formatLabelValue={(value) => (money ? formatMYR(value, 0) : formatUnits(value))}
      formatOption={(value) =>
        money ? formatMYR(value.toFixed(2)) : `${formatUnits(value)} ctn`
      }
      yAxisWidth={money ? 72 : 40}
      yTickFormatter={money ? (value: number) => formatMYR(value, 0) : undefined}
      header={
        <SegmentGroup label="By" busy={subjects.pending}>
          {TREND_SUBJECTS.map((value) => (
            <ChoiceButton
              key={value}
              look="segment"
              selected={subjects.value === value}
              pending={subjects.isPending(value)}
              dimmed={subjects.pending && !subjects.isPending(value)}
              onClick={() => subjects.choose(value, hrefFor(value))}
            >
              {TREND_SUBJECT_LABEL[value]}
            </ChoiceButton>
          ))}
        </SegmentGroup>
      }
    />
  );
}
