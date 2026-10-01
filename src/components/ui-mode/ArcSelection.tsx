"use client";

import { motion, useReducedMotion } from "motion/react";
import tabs from "@/components/arc/tabs/tabs.module.css";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { cn } from "@/lib/utils";

/**
 * Arc's gliding selection — the white, softly shadowed pill its tabs and
 * segmented control slide between options — for navigation built from links
 * rather than Arc's own tab list (the sidebar, the phone tab bar, the admin
 * tabs, the shop's category strip). Render it inside the active item, which
 * must be `relative`, under a parent with `isolate`; every item sharing a
 * `layoutId` glides the one pill between them.
 */
export function ArcSelection({ id, className }: { id: string; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      layoutId={id}
      className={cn(tabs.selection, className)}
      transition={reduced ? { duration: 0 } : motionTokens.spring.morph}
    />
  );
}
