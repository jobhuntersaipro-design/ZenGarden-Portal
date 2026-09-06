/**
 * The shared loading language (brief G1).
 *
 * Every one of these is a shape, not a spinner: a skeleton that matches the
 * final layout tells the reader what is coming and stops the page reflowing
 * when it lands. A centred spinner on a dense page still reads as lag, which
 * is the thing the 2026-09-06 review was filed about.
 *
 * These are server components — a `loading.tsx` must not pull the client
 * bundle in ahead of the page it stands in for.
 */

/** The one skeleton fill. `surface-soft`, so it reads as a placeholder tile. */
export function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-sm bg-surface-soft ${className}`}
    />
  );
}

/**
 * Wraps a whole page skeleton. One `role="status"` for the screen: a reader
 * hears "Loading…" once rather than a chorus from every placeholder tile.
 */
export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {children}
    </div>
  );
}

/** Eyebrow, h1 and the right-hand action slot, at `PageHeader`'s geometry. */
export function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-lg flex items-start justify-between gap-md">
      <div className="flex flex-col gap-xs">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-9 w-72" />
      </div>
      {action ? <Shimmer className="h-control-md w-36 rounded-pill" /> : null}
    </div>
  );
}

/** The chip row that sits under a header on every filtered screen. */
export function ControlsSkeleton() {
  return (
    <div className="mb-lg flex flex-wrap items-center gap-sm">
      {/* Literal classes: Tailwind scans source text, so a `w-${n}` built at
          runtime produces no CSS at all. */}
      {["w-20", "w-24", "w-20", "w-28"].map((width, index) => (
        <Shimmer key={index} className={`h-control-sm ${width} rounded-pill`} />
      ))}
    </div>
  );
}

/**
 * A KPI row. `wide` spans the first tile across two tracks, matching the
 * Dashboard and Buyer-detail rows where the money tile is double width.
 */
export function KpiRowSkeleton({
  tiles = 4,
  columns = 4,
  wide = false,
  compact = false,
}: {
  tiles?: number;
  columns?: number;
  wide?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`mb-lg grid gap-md sm:grid-cols-2 ${columns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}
    >
      {Array.from({ length: tiles }, (_, index) => (
        <div
          key={index}
          className={`rounded-md border border-hairline bg-canvas p-md ${
            wide && index === 0 ? "sm:col-span-2" : ""
          }`}
        >
          <Shimmer className="h-4 w-24" />
          <Shimmer className={`mt-xs ${compact ? "h-7" : "h-9"} w-36`} />
          <Shimmer className="mt-xs h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

/** A card with an eyebrow and a plot area. `height` is a Tailwind height. */
export function ChartSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <section className="rounded-lg border border-hairline bg-canvas p-lg">
      <Shimmer className="h-4 w-40" />
      <Shimmer className={`mt-md w-full ${height}`} />
    </section>
  );
}

/** Header row plus `rows` body rows, at `DataTable`'s cell geometry. */
export function TableSkeleton({
  rows = 8,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="flex gap-md border-b border-hairline px-md py-sm">
        {Array.from({ length: columns }, (_, index) => (
          <Shimmer key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex gap-md border-b border-hairline px-md py-sm last:border-0"
        >
          {Array.from({ length: columns }, (_, column) => (
            <Shimmer key={column} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of product cards, at `ProductCard`'s aspect and spacing. */
export function CardGridSkeleton({ cards = 12 }: { cards?: number }) {
  return (
    <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }, (_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-lg border border-hairline bg-canvas"
        >
          <Shimmer className="aspect-4/3 w-full rounded-none" />
          <div className="flex flex-col gap-xs p-md">
            <Shimmer className="h-4 w-4/5" />
            <Shimmer className="h-3 w-2/5" />
            <Shimmer className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
