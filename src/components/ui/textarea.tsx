"use client"

import * as React from "react"
import { cn } from "cn"
import arcStyles from "@/components/arc/textarea/textarea.module.css"

/** Arc's control, without its label row (our forms label their own fields). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(arcStyles.control, className)}
      {...props}
    />
  )
}

export { Textarea }
