"use client";

import dynamic from "next/dynamic";

/**
 * pdf.js reaches for `DOMMatrix` at module scope, which does not exist on the
 * server — and a `"use client"` component is still server-rendered for the
 * first paint. Loading it dynamically with `ssr: false` is what keeps that
 * import off the server entirely.
 *
 * `ssr: false` is not allowed inside a Server Component, so this thin client
 * wrapper is where it has to live.
 */
export const DocumentPreview = dynamic(
  () => import("@/components/review/DocumentPreview").then((m) => m.DocumentPreview),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-preview animate-pulse rounded-lg bg-surface-soft"
        aria-label="Loading the original file"
      />
    ),
  },
);
