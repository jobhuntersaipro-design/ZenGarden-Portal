"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { Checkbox as ArcCheckbox } from "@/components/arc/checkbox/checkbox"

/**
 * Arc's checkbox, a 44px target with a drawn tick. Unlabelled, because every
 * caller here pairs it with its own label.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <ArcCheckbox data-slot="checkbox" className={className} {...props} />
}

export { Checkbox }
