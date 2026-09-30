import type { Metadata } from "next";
import { ActionsSection } from "@/components/arc-gallery/ActionsSection";
import { BlocksSection } from "@/components/arc-gallery/BlocksSection";
import { ChartsSection } from "@/components/arc-gallery/ChartsSection";
import { DataSection } from "@/components/arc-gallery/DataSection";
import { FeedbackSection } from "@/components/arc-gallery/FeedbackSection";
import { NavigationSection } from "@/components/arc-gallery/NavigationSection";
import { SelectionSection } from "@/components/arc-gallery/SelectionSection";
import { TextInputsSection } from "@/components/arc-gallery/TextInputsSection";
import { Rise } from "@/components/portal/Rise";

export const metadata: Metadata = { title: "Arc preview · Zen Garden Portal" };

const GROUPS = [
  { id: "actions", label: "Actions" },
  { id: "text-inputs", label: "Inputs" },
  { id: "selection", label: "Toggles and dates" },
  { id: "navigation", label: "Navigation" },
  { id: "feedback", label: "Feedback" },
  { id: "data", label: "Data" },
  { id: "charts", label: "Charts" },
  { id: "blocks", label: "Blocks" },
] as const;

/**
 * Phase 1 of the Arc rebuild (docs/specs/60-arc-foundation.md): every Arc part
 * this portal will use, on our tokens, before any real screen changes.
 *
 * Static data only — nothing here reads or writes the database, so it is safe
 * on a preview deployment that shares production's.
 */
export default function ArcPreviewPage() {
  return (
    <>
      <Rise index={0} className="mb-lg">
        <p className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
          Rebuild · phase 1
        </p>
        <h1 className="font-display text-[length:var(--text-display-md)] font-[650] tracking-[-1.36px] text-ink">
          Arc preview
        </h1>
        <p className="mt-xxs max-w-[62ch] text-[length:var(--text-body-sm)] text-ink-secondary">
          73 parts from Arc, dressed in the portal&apos;s own tokens. Each names the
          job it will do here and the phase that puts it on a real screen. Nothing
          on this page reads or saves data.
        </p>
      </Rise>

      <nav
        aria-label="Groups on this page"
        className="mb-lg flex flex-wrap gap-xs"
      >
        {GROUPS.map((group) => (
          <a
            key={group.id}
            href={`#${group.id}-heading`}
            className="inline-flex min-h-control-md items-center rounded-pill border border-hairline px-sm text-[length:var(--text-body-sm)] text-ink-secondary hover:border-hairline-strong hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-control-sm"
          >
            {group.label}
          </a>
        ))}
      </nav>

      <ActionsSection />
      <TextInputsSection />
      <SelectionSection />
      <NavigationSection />
      <FeedbackSection />
      <DataSection />
      <ChartsSection />
      <BlocksSection />
    </>
  );
}
