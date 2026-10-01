"use client";

import type { ReactNode } from "react";
import { useUiMode } from "./UiModeProvider";

/**
 * For a server component with an Arc twin: it renders both trees as props
 * and this picks one by the preview switch, so the server component itself
 * never has to become a client one. Only the chosen tree reaches the DOM.
 */
export function ModeSwitch({ arc, children }: { arc: ReactNode; children: ReactNode }) {
  return <>{useUiMode() === "arc" ? arc : children}</>;
}
