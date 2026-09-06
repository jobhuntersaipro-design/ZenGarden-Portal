import Link from "next/link";

export type BarSegment = {
  id: string;
  label: string;
  count: number;
  /** A CSS colour — a token var or a `bg-*` class is resolved by the caller. */
  color: string;
  /**
   * Where this slice of work lives, if anywhere. The Dashboard's intake and
   * stage breakdowns are the backlog, and the review found them reading as
   * decoration beside the sales KPIs — so each legend entry is the way into
   * the rows it counts (brief §2).
   */
  href?: string;
};

/**
 * One 14px stacked bar with a 2px gap between segments and a legend under it.
 * Every segment carries its label and its count, so colour never has to carry
 * the meaning on its own (00-master.md §4).
 *
 * This is the one place a status colour is used as a fill rather than as text:
 * it is a legend swatch, and a label sits beside every one.
 */
export function StatusBar({
  eyebrow,
  caption,
  segments,
}: {
  /** Both omitted when the bar is the legend of a card that has its own header. */
  eyebrow?: string;
  caption?: string;
  segments: BarSegment[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);

  return (
    <div className="flex flex-col gap-sm">
      {eyebrow || caption ? (
        <div className="flex items-baseline justify-between gap-sm">
          <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
            {eyebrow}
          </p>
          <p className="text-[length:var(--text-caption)] text-ink-tertiary">
            {caption}
          </p>
        </div>
      ) : null}

      <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-pill bg-surface-soft">
        {total === 0
          ? null
          : segments
              .filter((segment) => segment.count > 0)
              .map((segment) => (
                <div
                  key={segment.id}
                  title={`${segment.label}: ${segment.count}`}
                  style={{
                    width: `${(segment.count / total) * 100}%`,
                    backgroundColor: segment.color,
                  }}
                  className="h-full first:rounded-l-pill last:rounded-r-pill"
                />
              ))}
      </div>

      <ul className="flex flex-wrap gap-md">
        {segments.map((segment) => {
          const body = (
            <>
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-xxs"
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-[length:var(--text-caption)] text-ink-secondary">
                {segment.label}
              </span>
              <span className="tabular-nums text-[length:var(--text-caption)] font-medium text-ink">
                {segment.count}
              </span>
            </>
          );

          return (
            <li key={segment.id}>
              {segment.href ? (
                <Link
                  href={segment.href}
                  className="flex items-center gap-xxs rounded-xxs underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {body}
                </Link>
              ) : (
                <span className="flex items-center gap-xxs">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
