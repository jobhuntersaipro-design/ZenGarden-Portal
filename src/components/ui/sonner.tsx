"use client"

import { useEffect } from "react"
import {
  ToastStack,
  ToastStackProvider,
  useToastStack,
} from "@/components/arc/toast-stack/toast-stack"
import { registerArcToasts } from "@/lib/toast"

/** Hands Arc's stack to `@/lib/toast`, so `toast.success(…)` lands in it. */
function ArcToastBridge() {
  const { toast } = useToastStack()
  useEffect(() => registerArcToasts((options) => void toast(options)), [toast])
  return null
}

/**
 * The app's toaster: Arc's stack — toasts that pile and fan out on hover,
 * with an undo that morphs in place. On a phone it sits above the tab bar.
 */
function Toaster() {
  return (
    <ToastStackProvider>
      <ArcToastBridge />
      <ToastStack className="max-lg:bottom-ui-toast" />
    </ToastStackProvider>
  )
}

export { Toaster }
