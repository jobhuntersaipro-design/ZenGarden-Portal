"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type ComboboxOption = { id: string; label: string; hint?: string };

/**
 * Existing options plus, when nothing matches exactly, an explicit "Create …"
 * row. Used for both buyer and product; neither ever creates something by
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
}: {
  value: string | null;
  options: ComboboxOption[];
  placeholder: string;
  createLabel?: (query: string) => string;
  onSelect: (option: ComboboxOption) => void;
  onCreate?: (name: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.id === value);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options.slice(0, 50);
  const exact = options.some((option) => option.label.toLowerCase() === needle);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className="flex h-control-md w-full items-center justify-between gap-xs rounded-sm border border-hairline-strong bg-transparent px-2.5 text-left text-[length:var(--text-body-sm)] focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-primary"
      >
        {/* The full value is always recoverable, even when the trigger clips it. */}
        <span
          title={selected?.label ?? undefined}
          className={`truncate ${selected ? "text-ink" : "text-ink-tertiary"}`}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-tertiary" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-xs">
        <Input
          autoFocus
          value={query}
          placeholder="Search…"
          onChange={(event) => setQuery(event.target.value)}
          className="h-control-sm"
        />
        <ul className="mt-xs max-h-64 overflow-y-auto">
          {matches.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center gap-xs rounded-sm px-xs py-xxs text-left text-[length:var(--text-body-sm)] text-ink hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Check
                  className={`size-4 shrink-0 ${option.id === value ? "text-ink" : "text-transparent"}`}
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
                className="w-full rounded-sm px-xs py-xxs text-left text-[length:var(--text-body-sm)] text-brand-link hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary"
              >
                {createLabel(query.trim())}
              </button>
            </li>
          ) : null}
          {matches.length === 0 && !needle ? (
            <li className="px-xs py-xxs text-[length:var(--text-body-sm)] text-ink-tertiary">
              Nothing to choose from yet.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
