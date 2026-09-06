import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { IntakeCounts } from "@/lib/queries/dashboard";
import { INTAKE_STATUS } from "@/components/portal/StatusBadge";

/**
 * What the reader has to do, above what the business did.
 *
 * The dashboard opened on total sales, order count and top buyer and never
 * said a single PO was waiting — the backlog had moved to the Purchase orders
 * chips, where you only see it if you already went looking (2026-09-06 review,
 * B4). This is not the intake status bar that was deliberately removed on
 * 2026-09-06: that always drew all four statuses as analytics. This renders
 * only when there is work, and every line is the way into the rows it counts.
 *
 * It is deliberately outside the date range: a draft has no PO date, so a
 * ranged link to it lands on an empty table — the defect already recorded
 * against the intake links in the 2026-09-06 UI-change brief.
 */
export function WorkQueue({ intake }: { intake: IntakeCounts }) {
  const jobs = [
    {
      key: "needs-review",
      count: intake.needsReview,
      tone: INTAKE_STATUS.NEEDS_REVIEW,
      one: "purchase order needs review",
      many: "purchase orders need review",
    },
    {
      key: "failed",
      count: intake.failed,
      tone: INTAKE_STATUS.FAILED,
      one: "upload failed to extract",
      many: "uploads failed to extract",
    },
  ].filter((job) => job.count > 0);

  // Nothing to do is not a thing to report. An empty queue renders nothing at
  // all rather than an "All clear" card that becomes chrome within a week.
  if (jobs.length === 0) return null;

  return (
    <section
      aria-labelledby="work-queue"
      className="mb-lg rounded-md border border-hairline bg-canvas p-md"
    >
      <h2
        id="work-queue"
        className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary"
      >
        Needs you
      </h2>
      <ul className="mt-xs flex flex-col gap-xxs">
        {jobs.map((job) => (
          <li key={job.key}>
            <Link
              href={`/purchase-orders?status=${job.key}`}
              className="-mx-xs flex min-h-control-md items-center gap-xs rounded-sm px-xs text-[length:var(--text-body-md)] text-ink transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${job.tone.dot}`}
              />
              <span className="min-w-0">
                <span className="font-semibold tabular-nums">{job.count}</span>{" "}
                {job.count === 1 ? job.one : job.many}
              </span>
              <ArrowRight
                className="ml-auto size-4 shrink-0 text-ink-tertiary"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
      {/* Not a job — nobody acts on it — but it explains a count that is about
          to change under them. */}
      {intake.extracting > 0 ? (
        <p className="mt-xs text-[length:var(--text-caption)] text-ink-tertiary">
          {intake.extracting} still extracting.
        </p>
      ) : null}
    </section>
  );
}
