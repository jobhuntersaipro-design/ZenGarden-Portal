"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Spinner } from "@/components/portal/Spinner";
import { UI_MODE_COOKIE, parseUiMode, type UiMode } from "@/lib/ui-mode";
import { useUiMode } from "./UiModeProvider";

const OPTIONS = [
  { value: "classic", label: "Current" },
  { value: "arc", label: "Arc" },
];

/** A year, so the choice survives a closed browser. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * The Current / Arc switch, pinned to the bottom of every page outside
 * production, for comparing the earlier look while it is still in the tree.
 * Arc is the default. It writes the cookie and re-renders the page in place,
 * so filters, scroll and drafts held in the URL stay put. Never rendered in
 * production (`ui-mode.ts`), which always draws Arc.
 *
 * Bottom-centre from `lg`: bottom-left covered the sidebar's account menu
 * (measured — a click on it landed on the switch). Below `lg` it sits
 * bottom-left above the tab bar, which has nothing under it.
 */
export function UiModeSwitch() {
  const mode = useUiMode();
  const router = useRouter();
  const [chosen, setChosen] = useState<UiMode>(mode);
  const [pending, startTransition] = useTransition();
  const shown = pending ? chosen : mode;

  const choose = (value: string) => {
    const next = parseUiMode(value);
    if (!next || next === mode) return;
    setChosen(next);
    document.cookie = `${UI_MODE_COOKIE}=${next}; path=/; max-age=${MAX_AGE}; samesite=lax`;
    startTransition(() => router.refresh());
  };

  return (
    <div
      data-ui-switch
      className="fixed left-sm bottom-ui-switch z-50 flex items-center gap-xs rounded-pill border border-hairline bg-surface p-xxs shadow-md sm:pl-sm print:hidden lg:bottom-lg lg:left-1/2 lg:-translate-x-1/2"
    >
      <span className="flex items-center gap-xxs text-caption text-ink-secondary max-sm:sr-only">
        {pending ? <Spinner /> : null}
        Components
      </span>
      <SegmentedControl
        label="Component set"
        options={OPTIONS}
        value={shown}
        onValueChange={choose}
      />
    </div>
  );
}
