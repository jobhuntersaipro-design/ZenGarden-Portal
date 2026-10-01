"use client";

import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "cn";
import arc from "@/components/arc/combobox/combobox.module.css";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Arc's option row, a little taller on a phone so it clears the 44px floor. */
const OPTION = cn(
  arc.option,
  "w-full justify-start text-left hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-2 focus-visible:outline-focus max-sm:min-h-11",
);

export type ComboboxOption = { id: string; label: string; hint?: string };

/**
 * Existing options plus, when nothing matches exactly, an explicit "Create …"
 * row. Drawn with Arc's combobox parts — its control, search row, listbox and
 * options — around our own behaviour, because Arc's combobox has no create row
 * and no pinned rows, and both are the point of this one. Used for both buyer and product; neither ever creates something by
 * accident — a new record is always a row the user picked.
 */
export function Combobox({
  value,
  options,
  placeholder,
  createLabel,
  onSelect,
  onCreate,
  ariaLabel,
  pinned,
  invalid,
  describedBy,
}: {
  value: string | null;
  options: ComboboxOption[];
  placeholder: string;
  createLabel?: (query: string) => string;
  onSelect: (option: ComboboxOption) => void;
  onCreate?: (name: string) => void;
  ariaLabel: string;
  /**
   * Rows always shown at the foot of the list, whatever the query. A decision
   * like "create a new one" has to stay reachable precisely when the search
   * matches nothing, which is when the filtered list would have dropped it.
   */
  pinned?: ComboboxOption[];
  /**
   * The trigger carries `aria-invalid`, so a required picker left empty is
   * announced as invalid and takes the destructive border the `Input` and
   * `Select` primitives already give a bad field — a red message under a
   * control that still looks fine is the half-done version of this.
   */
  invalid?: boolean;
  /** The id of that message, so the control names its own reason. */
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // The trigger must be able to render a pinned row's label; filtering below
  // deliberately still reads `options` alone.
  const selected = [...options, ...(pinned ?? [])].find(
    (option) => option.id === value,
  );
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options.slice(0, 50);
  const exact = options.some((option) => option.label.toLowerCase() === needle);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          arc.control,
          open && arc.open,
          "w-full justify-between text-left focus-visible:outline-2 focus-visible:outline-focus aria-invalid:border-destructive",
        )}
      >
        {/* The full value is always recoverable, even when the trigger clips it. */}
        <span
          title={selected?.label ?? undefined}
          className={`min-w-0 flex-1 truncate ${selected ? "text-ink" : "text-ink-tertiary"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn(arc.chevron, "size-4")} aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-xs"
      >
        <div className={cn(arc.control, "sm:min-h-control-sm")}>
          <Search className={cn(arc.searchIcon, "size-4")} aria-hidden />
          <input
            autoFocus
            aria-label={`Search ${ariaLabel.toLowerCase()}`}
            value={query}
            placeholder="Search…"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul className={cn(arc.listbox, "mt-xs")}>
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery("");
                }}
                className={OPTION}
              >
                <Check
                  className={cn(arc.check, "size-4", option.id !== value && "text-transparent")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" title={option.label}>
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="shrink-0 text-[length:var(--text-caption)] text-ink-tertiary">
                    {option.hint}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {onCreate && createLabel && needle && !exact ? (
            <li>
              <button
                type="button"
                onClick={() => {
                  onCreate(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(OPTION, "text-brand-link")}
              >
                {createLabel(query.trim())}
              </button>
            </li>
          ) : null}
          {pinned?.length
            ? pinned.map((option, index) => (
                <li
                  key={option.id}
                  className={index === 0 ? "mt-xxs border-t border-hairline pt-xxs" : ""}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(option);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={OPTION}
                  >
                    <Check
                      className={cn(arc.check, "size-4", option.id !== value && "text-transparent")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate" title={option.label}>
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="shrink-0 text-[length:var(--text-caption)] text-ink-tertiary">
                        {option.hint}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            : null}
          {matches.length === 0 && !needle && !pinned?.length ? (
            <li className={arc.empty}>
              Nothing to choose from yet.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
