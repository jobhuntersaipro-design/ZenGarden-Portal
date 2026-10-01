"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "cn";
import arcInput from "@/components/arc/input/input.module.css";
import { Calendar } from "@/components/arc/calendar/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/dates";

/** `2026-10-01` → a local Date on that calendar day, or undefined. */
export function isoToDate(iso: string | undefined | null): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A local Date → `2026-10-01`, read from its own calendar parts. */
export function dateToIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A date field: Arc's calendar in a popover, behind a trigger drawn as our
 * field control, so the label, error and confidence chrome around it stay the
 * caller's. Speaks `yyyy-mm-dd` strings, exactly what the native date input it
 * replaces did, so no caller's state or schema changes.
 *
 * The trigger prints the date through `formatDate` (`1 Oct 2026`), the same
 * on server and client; the calendar only renders once opened, so nothing
 * locale-dependent reaches hydration.
 */
export function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Choose a date",
  clearable = true,
  disabled,
  className,
  ...aria
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  /** Earliest pickable day, `yyyy-mm-dd`. */
  min?: string;
  /** Latest pickable day, `yyyy-mm-dd`. */
  max?: string;
  placeholder?: string;
  /** Offer Clear in the calendar's footer. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = isoToDate(value);
  const [month, setMonth] = React.useState<Date | undefined>(undefined);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setMonth(selected ?? isoToDate(max) ?? undefined);
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          {...aria}
          title={selected ? formatDate(value) : undefined}
          className={cn(
            arcInput.input,
            "flex items-center gap-xs text-left tabular-nums",
            !selected && "text-ink-tertiary",
            className,
          )}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0 text-ink-tertiary" />
          <span className="min-w-0 flex-1 truncate">
            {selected ? formatDate(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-sm">
        <Calendar
          value={selected}
          month={month}
          onMonthChange={setMonth}
          minDate={isoToDate(min)}
          maxDate={isoToDate(max)}
          locale="en-GB"
          showToday
          onChange={(date) => {
            onChange(dateToIso(date));
            setOpen(false);
          }}
        />
        {clearable && selected ? (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className="self-start rounded-xxs text-[length:var(--text-caption)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
