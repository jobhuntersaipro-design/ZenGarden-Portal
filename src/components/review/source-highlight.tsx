"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Source } from "@/lib/extraction/source-match";

/**
 * What the reviewer is pointing at on the review screen (2026-10-27): the
 * field rows set it on hover and focus, the PDF preview marks it. Outside a
 * provider — the PO detail page, a certificate — the preview marks nothing.
 */
interface Active {
  sources: readonly Source[];
  /** The row being pointed at, where the connector line ends. */
  anchor: HTMLElement | null;
}

const NONE: readonly Source[] = [];
const IDLE: Active = { sources: NONE, anchor: null };

const SourceHighlight = createContext<{
  active: Active;
  setActive: (active: Active) => void;
} | null>(null);

export function SourceHighlightProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active>(IDLE);
  return (
    <SourceHighlight.Provider value={{ active, setActive }}>{children}</SourceHighlight.Provider>
  );
}

export const useHighlightedSources = () => useContext(SourceHighlight)?.active.sources ?? NONE;

/**
 * Props that point at `sources` while the pointer or focus is inside the
 * element, and clear when it leaves.
 */
export function useSourceTarget(sources: readonly Source[] | undefined) {
  const context = useContext(SourceHighlight);
  if (!context || !sources?.length) return {};
  const show = (event: { currentTarget: HTMLElement }) =>
    context.setActive({ sources, anchor: event.currentTarget });
  const hide = () => context.setActive(IDLE);
  return { onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide };
}

interface Line {
  from: [number, number];
  to: [number, number];
}

/** Where the line runs, in the overlay's own coordinates, or null when there is nothing to join. */
function measure(overlay: SVGSVGElement, anchor: HTMLElement): Line | null {
  const box = overlay.getBoundingClientRect();
  const row = anchor.getBoundingClientRect();
  for (const mark of overlay.parentElement?.querySelectorAll(".textLayer mark") ?? []) {
    const at = mark.getBoundingClientRect();
    const pane = mark.closest(".overflow-auto")?.getBoundingClientRect();
    // Only a mark the reader can see, and only beside the row: stacked on a
    // phone, a line from the page down to a field would cross everything between.
    const visible =
      !pane || (at.top >= pane.top && at.bottom <= pane.bottom && at.left >= pane.left && at.right <= pane.right);
    if (!visible || at.right > row.left - 8) continue;
    return {
      from: [at.right - box.left + 2, at.top + at.height / 2 - box.top],
      to: [row.left - box.left - 6, row.top + row.height / 2 - box.top],
    };
  }
  return null;
}

/**
 * The line from a hovered field to its value on the PDF (2026-10-27), as Arc's
 * document-extract block draws it. An overlay on the review card, redrawn each
 * frame while a row is pointed at, since the page scrolls and zooms under it.
 */
export function SourceConnector() {
  const anchor = useContext(SourceHighlight)?.active.anchor ?? null;
  const overlay = useRef<SVGSVGElement>(null);
  const [line, setLine] = useState<Line | null>(null);

  useEffect(() => {
    if (!anchor) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      const next = overlay.current ? measure(overlay.current, anchor) : null;
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setLine(next);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [anchor]);

  // A line left over from the last row is not drawn once nothing is pointed at.
  const shown = anchor ? line : null;
  const bend = shown ? (shown.to[0] - shown.from[0]) / 2 : 0;
  return (
    <svg ref={overlay} aria-hidden data-source-connector className="pointer-events-none absolute inset-0 z-10 size-full">
      {shown ? (
        <g className="fill-brand-amber-strong stroke-brand-amber-strong">
          <path
            d={`M${shown.from[0]},${shown.from[1]} C${shown.from[0] + bend},${shown.from[1]} ${shown.to[0] - bend},${shown.to[1]} ${shown.to[0]},${shown.to[1]}`}
            fill="none"
            strokeWidth={1.5}
          />
          <circle cx={shown.from[0]} cy={shown.from[1]} r={3} stroke="none" />
          <circle cx={shown.to[0]} cy={shown.to[1]} r={3} stroke="none" />
        </g>
      ) : null}
    </svg>
  );
}
