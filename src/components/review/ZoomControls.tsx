"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/** `"fit"` is the default: the page is exactly as wide as its container. */
export type Zoom = number | "fit";

export const MIN_ZOOM = ZOOM_STEPS[0];
export const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** The next step up or down from wherever the current scale actually sits. */
export function stepZoom(current: number, direction: -1 | 1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((value) => value > current + 0.001) ?? MAX_ZOOM;
  }
  return [...ZOOM_STEPS].reverse().find((value) => value < current - 0.001) ?? MIN_ZOOM;
}

export function ZoomControls({
  scale,
  onChange,
}: {
  /** The resolved scale — "fit" has already been turned into a number. */
  scale: number;
  onChange: (next: Zoom) => void;
}) {
  return (
    <div className="flex items-center gap-xs">
      <Button
        variant="secondary"
        aria-label="Zoom out"
        disabled={scale <= MIN_ZOOM}
        onClick={() => onChange(stepZoom(scale, -1))}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      {/* Announced, so the change reaches a screen reader and not only the eye. */}
      <span
        aria-live="polite"
        className="min-w-12 text-center font-mono text-[length:var(--text-caption)] tabular-nums text-ink-secondary"
      >
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="secondary"
        aria-label="Zoom in"
        disabled={scale >= MAX_ZOOM}
        onClick={() => onChange(stepZoom(scale, 1))}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
      <Button
        variant="secondary"
        aria-label="Fit the document to the width"
        onClick={() => onChange("fit")}
      >
        Fit
      </Button>
    </div>
  );
}
