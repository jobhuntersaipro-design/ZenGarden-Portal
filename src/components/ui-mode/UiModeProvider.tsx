"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UiMode } from "@/lib/ui-mode";

const UiModeContext = createContext<UiMode>("classic");

/**
 * Carries the mode the root layout read from the cookie to every primitive
 * that has an Arc twin. A primitive outside the provider draws classic, so
 * anything rendered in a test or an email stays exactly as it was.
 */
export function UiModeProvider({ mode, children }: { mode: UiMode; children: ReactNode }) {
  return <UiModeContext.Provider value={mode}>{children}</UiModeContext.Provider>;
}

export function useUiMode(): UiMode {
  return useContext(UiModeContext);
}

export function useIsArc(): boolean {
  return useContext(UiModeContext) === "arc";
}
