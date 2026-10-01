import { toast as sonner } from "sonner";
import type { ToastOptions as ArcToastOptions } from "@/components/arc/toast-stack/toast-stack";

/**
 * Every toast in the app goes through here. In the preview switch's Arc mode
 * (docs/specs/61-arc-preview-switch.md) it lands in Arc's toast stack, which
 * `Toaster` mounts and registers below; otherwise in sonner, as it always has.
 * The mode is read off `<html data-ui>` at call time, so a toast fired from a
 * callback after the switch flips follows the page it lands on.
 *
 * The surface is the subset of sonner's API this app uses: a message, an
 * optional description and one action.
 */
export interface ToastOptions {
  description?: string;
  action?: { label: string; onClick: () => unknown };
}

type ArcSink = (options: ArcToastOptions) => void;

let arcSink: ArcSink | null = null;

/** Called by the Arc toaster while it is mounted; returns the unregister. */
export function registerArcToasts(sink: ArcSink): () => void {
  arcSink = sink;
  return () => {
    if (arcSink === sink) arcSink = null;
  };
}

function arcActive(): boolean {
  return (
    arcSink !== null &&
    typeof document !== "undefined" &&
    document.documentElement.dataset.ui === "arc"
  );
}

type Kind = "message" | "success" | "error" | "warning";

function show(kind: Kind, message: string, options: ToastOptions = {}) {
  if (arcActive() && arcSink) {
    arcSink({
      type: kind === "message" ? "info" : kind,
      title: message,
      description: options.description,
      action: options.action
        ? { label: options.action.label, onClick: () => void options.action?.onClick() }
        : undefined,
    });
    return;
  }
  const sonnerOptions = {
    description: options.description,
    action: options.action
      ? { label: options.action.label, onClick: () => void options.action?.onClick() }
      : undefined,
  };
  if (kind === "message") sonner(message, sonnerOptions);
  else sonner[kind](message, sonnerOptions);
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => show("message", message, options),
  {
    success: (message: string, options?: ToastOptions) => show("success", message, options),
    error: (message: string, options?: ToastOptions) => show("error", message, options),
    warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  },
);
