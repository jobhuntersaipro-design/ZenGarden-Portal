"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Source } from "@/lib/extraction/source-match";

/**
 * What the reviewer is pointing at on the review screen (2026-10-27): the
 * field rows set it on hover and focus, the PDF preview marks it. Outside a
 * provider — the PO detail page, a certificate — the preview marks nothing.
 */
const SourceHighlight = createContext<{
  sources: readonly Source[];
  setSources: (sources: readonly Source[]) => void;
} | null>(null);

const NONE: readonly Source[] = [];

export function SourceHighlightProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<readonly Source[]>(NONE);
  return (
    <SourceHighlight.Provider value={{ sources, setSources }}>{children}</SourceHighlight.Provider>
  );
}

export const useHighlightedSources = () => useContext(SourceHighlight)?.sources ?? NONE;

/**
 * Props that point at `sources` while the pointer or focus is inside the
 * element, and clear when it leaves.
 */
export function useSourceTarget(sources: readonly Source[] | undefined) {
  const context = useContext(SourceHighlight);
  if (!context || !sources?.length) return {};
  const show = () => context.setSources(sources);
  const hide = () => context.setSources(NONE);
  return { onPointerEnter: show, onPointerLeave: hide, onFocus: show, onBlur: hide };
}
