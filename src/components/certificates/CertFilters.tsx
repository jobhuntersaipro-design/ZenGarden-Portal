"use client";

import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import {
  FilterToolbar,
  type FilterChip,
  type FilterField,
} from "@/components/arc/filter-toolbar/filter-toolbar";
import { Input } from "@/components/ui/input";
import { useUrlNavigation } from "@/hooks/useUrlNavigation";

/** One filter: the URL key, its label and every value it can take. */
export type CertFilterField = {
  id: string;
  label: string;
  options: { value: string; label: string; hint?: number }[];
};

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Search and Arc's filter toolbar for both certification views (2026-10-14).
 * Every filter lives in the URL; a chip is shown only for a value the page
 * resolved, so the bar never shows a filter the rows are not under.
 */
export function CertFilters({
  fields,
  placeholder,
  children,
}: {
  fields: CertFilterField[];
  placeholder: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useUrlNavigation();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const write = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  };

  const active: FilterChip[] = fields.flatMap((field) => {
    const option = field.options.find((o) => o.value === searchParams.get(field.id));
    return option ? [{ id: field.id, label: field.label, value: option.label }] : [];
  });

  return (
    <div className="mb-sm flex flex-wrap items-center gap-sm">
      <div className="relative w-full sm:w-72">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-ink-tertiary"
        />
        <Input
          aria-label="Search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => write({ q: event.target.value }), SEARCH_DEBOUNCE_MS);
          }}
          className="h-control-md pl-xl sm:h-control-sm"
        />
      </div>
      <div className="min-w-0 basis-full sm:min-w-72 sm:basis-auto sm:flex-1">
        <FilterToolbar
          label="Certification filters"
          filters={active}
          onRemove={(id) => write({ [id]: null })}
          onClearAll={() => write(Object.fromEntries(fields.map((f) => [f.id, null])))}
          addFilter={{
            label: "Add filter",
            fields: fields.map(
              (field): FilterField => ({
                id: field.id,
                label: field.label,
                options: field.options.map((o) => ({ value: o.value, label: o.label, hint: o.hint })),
              }),
            ),
            // The menu hands back the label it showed; map it to the URL value.
            onAdd: (chip) =>
              write({
                [chip.id]:
                  fields
                    .find((f) => f.id === chip.id)
                    ?.options.find((o) => o.label === chip.value)?.value ?? null,
              }),
          }}
        />
      </div>
      {children}
    </div>
  );
}
