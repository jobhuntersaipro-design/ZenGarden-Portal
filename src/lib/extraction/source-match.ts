import { format, isValid, parseISO } from "date-fns";

/**
 * Where a reviewed value sits on the PDF (2026-10-27). The extraction keeps no
 * positions, so the review screen finds a value the way a reader would: by
 * looking for it in the page's text layer. Each kind knows how the value is
 * printed — a money figure with thousands separators, a date in any common
 * layout — and returns the character ranges of one text item to mark.
 * A scan with no text layer simply marks nothing.
 */
export type SourceKind = "text" | "money" | "date";
export interface Source {
  kind: SourceKind;
  value: string;
}
export type Range = [start: number, end: number];

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** Every case-insensitive occurrence of `needle` in `haystack`. */
function occurrences(haystack: string, needle: string): Range[] {
  const ranges: Range[] = [];
  const text = haystack.toLowerCase();
  const target = needle.toLowerCase();
  if (!target) return ranges;
  for (let at = text.indexOf(target); at !== -1; at = text.indexOf(target, at + target.length)) {
    ranges.push([at, at + target.length]);
  }
  return ranges;
}

const collapse = (value: string) => value.trim().replace(/\s+/g, " ");

function textRanges(item: string, value: string): Range[] {
  const needle = collapse(value);
  if (needle.length < 2) return [];
  const found = occurrences(item, needle);
  if (found.length) return found;
  // A name printed shorter than it was read — "AKSES NUSANTARA DISTRIBUSI"
  // for "PT. AKSES NUSANTARA DISTRIBUSI" — marks the whole item, but only for
  // a long item, or every "PT." on the page would light up.
  const whole = collapse(item);
  if (whole.length >= 6 && needle.toLowerCase().includes(whole.toLowerCase())) {
    const start = item.indexOf(whole);
    return [[start, start + whole.length]];
  }
  return [];
}

function moneyRanges(item: string, value: string): Range[] {
  const target = Number.parseFloat(value.replace(/,/g, ""));
  // A zero is everywhere on a purchase order and points at nothing.
  if (!Number.isFinite(target) || target === 0) return [];
  const ranges: Range[] = [];
  for (const match of item.matchAll(NUMBER)) {
    const figure = Number.parseFloat(match[0].replace(/,/g, ""));
    if (Math.abs(figure - target) < 0.005) {
      ranges.push([match.index, match.index + match[0].length]);
    }
  }
  return ranges;
}

const DATE_LAYOUTS = [
  "d MMM yyyy", "dd MMM yyyy", "d MMMM yyyy", "dd MMMM yyyy",
  "dd-MMM-yy", "d-MMM-yy", "dd-MMM-yyyy", "d-MMM-yyyy",
  "dd/MM/yyyy", "d/M/yyyy", "dd/MM/yy", "dd.MM.yyyy", "dd-MM-yyyy",
  "yyyy-MM-dd", "yyyy/MM/dd", "MMM d, yyyy", "MMMM d, yyyy",
];

function dateRanges(item: string, value: string): Range[] {
  const date = parseISO(value);
  if (!isValid(date)) return [];
  const layouts = new Set(DATE_LAYOUTS.map((layout) => format(date, layout)));
  // Longest first, so "02-Oct-2026" is not also marked as "02-Oct-20…".
  for (const printed of [...layouts].sort((a, b) => b.length - a.length)) {
    const found = occurrences(item, printed);
    if (found.length) return found;
  }
  return [];
}

const MATCHERS: Record<SourceKind, (item: string, value: string) => Range[]> = {
  text: textRanges,
  money: moneyRanges,
  date: dateRanges,
};

/** The ranges of one text item that any of `sources` points at, sorted and merged. */
export function sourceRanges(item: string, sources: readonly Source[]): Range[] {
  const ranges = sources
    .flatMap((source) => (source.value ? MATCHERS[source.kind](item, source.value) : []))
    .sort((a, b) => a[0] - b[0]);
  const merged: Range[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One text item as HTML, its matched ranges wrapped in `<mark class=…>`. */
export function markSources(item: string, sources: readonly Source[], className: string): string {
  const ranges = sourceRanges(item, sources);
  if (!ranges.length) return escape(item);
  let html = "";
  let at = 0;
  for (const [start, end] of ranges) {
    html += `${escape(item.slice(at, start))}<mark class="${className}">${escape(item.slice(start, end))}</mark>`;
    at = end;
  }
  return html + escape(item.slice(at));
}
