"use client";

import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/arc/badge/badge";
import { useIsArc } from "@/components/ui-mode/UiModeProvider";

/**
 * A status pill that is Arc's badge in the preview switch's Arc mode and our
 * own pill otherwise. Separate from `StatusBadge.tsx` because that module
 * exports the status palette to server code, and a value exported from a
 * client module is not that value on the server.
 */
export function ModeBadge({
  tone,
  classic,
  icon,
  children,
}: {
  /** Arc's nearest tone: info, warning, danger, success or neutral. */
  tone: BadgeTone;
  /** The classic pill's classes. */
  classic: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const isArc = useIsArc();
  if (isArc) {
    return (
      <Badge tone={tone} size="sm" icon={icon} className="shrink-0">
        {children}
      </Badge>
    );
  }
  return (
    <span className={classic}>
      {icon}
      {children}
    </span>
  );
}
