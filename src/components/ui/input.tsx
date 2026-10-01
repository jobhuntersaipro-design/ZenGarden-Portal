"use client"

import * as React from "react"
import { cn } from "cn"
import arcStyles from "@/components/arc/input/input.module.css"

/**
 * Arc's field control. Our forms label their own fields, so the control is
 * drawn without Arc's built-in label row.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(arcStyles.input, className)}
      {...props}
    />
  )
}

export { Input }
