import type { ReactNode } from "react";

/**
 * One Arc part on the preview page: its name, the job it will do here and the
 * phase that puts it there, then the part itself on our tokens.
 *
 * The frame is ours (Tailwind on the ClickUp tokens); only what sits inside
 * `children` is Arc. A reader comparing the two can tell where one ends.
 */
export function Specimen({
  name,
  job,
  phase,
  wide = false,
  children,
}: {
  /** Arc's registry name, e.g. `split-button`. */
  name: string;
  /** Where it goes in this portal, in one line. */
  job: string;
  /** The rebuild phase that ships it on a real screen (2–6). */
  phase: number;
  /** Spans both columns from `lg`, for charts, tables and blocks. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={name}
      aria-labelledby={`${name}-title`}
      className={`flex min-w-0 flex-col gap-sm rounded-lg border border-hairline bg-canvas p-md ${
        wide ? "lg:col-span-2" : ""
      }`}
    >
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-sm gap-y-xxs">
        <h3
          id={`${name}-title`}
          className="font-mono text-[length:var(--text-eyebrow)] text-ink"
        >
          {name}
        </h3>
        <span className="text-[length:var(--text-caption)] text-ink-tertiary">
          Phase {phase}
        </span>
        <p className="basis-full text-[length:var(--text-body-sm)] text-ink-secondary">
          {job}
        </p>
      </header>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A heading and a two-column grid of specimens. */
export function GalleryGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="mb-xl">
      <h2
        id={`${id}-heading`}
        className="mb-md font-display text-[length:var(--text-heading-md)] font-[650] tracking-[-0.91px] text-ink"
      >
        {title}
      </h2>
      <div className="grid grid-cols-1 gap-md lg:grid-cols-2">{children}</div>
    </section>
  );
}
