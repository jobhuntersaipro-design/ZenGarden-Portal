import type { ToastOptions as ArcToastOptions } from "@/components/arc/toast-stack/toast-stack";

/**
 * Every toast in the app goes through here and lands in Arc's toast stack,
 * which `Toaster` mounts and registers below. A toast fired before the stack
 * has mounted (or after it has gone) is dropped rather than thrown.
 *
 * The surface is the subset of sonner's API this app was written against: a
 * message, an optional description and one action.
 */
export interface ToastOptions {
  description?: string;
  action?: { label: string; onClick: () => unknown };
}

type ArcSink = (options: ArcToastOptions) => void;

let arcSink: ArcSink | null = null;

/** Called by the toaster while it is mounted; returns the unregister. */
export function registerArcToasts(sink: ArcSink): () => void {
  arcSink = sink;
  return () => {
    if (arcSink === sink) arcSink = null;
  };
}

type Kind = "message" | "success" | "error" | "warning";

function show(kind: Kind, message: string, options: ToastOptions = {}) {
  arcSink?.({
    type: kind === "message" ? "info" : kind,
    title: message,
    description: options.description,
    action: options.action
      ? { label: options.action.label, onClick: () => void options.action?.onClick() }
      : undefined,
  });
}

export const toast = Object.assign(
  (message: string, options?: ToastOptions) => show("message", message, options),
  {
    success: (message: string, options?: ToastOptions) => show("success", message, options),
    error: (message: string, options?: ToastOptions) => show("error", message, options),
    warning: (message: string, options?: ToastOptions) => show("warning", message, options),
  },
);
