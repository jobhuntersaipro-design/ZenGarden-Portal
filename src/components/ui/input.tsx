"use client"

import * as React from "react"
import { cn } from "cn"
import arcStyles from "@/components/arc/input/input.module.css"
import { useIsArc } from "@/components/ui-mode/UiModeProvider"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  // Arc mode: Arc's field control. Our forms label their own fields, so the
  // control is drawn without Arc's built-in label row.
  const arc = useIsArc()
  if (arc) {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(arcStyles.input, className)}
        {...props}
      />
    )
  }
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-sm border border-hairline-strong bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
