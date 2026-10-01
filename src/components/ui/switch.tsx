"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"
import { Switch as ArcSwitch } from "@/components/arc/switch/switch"

/** Arc's switch, whose thumb stretches as it travels. */
function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return <ArcSwitch data-slot="switch" className={className} {...props} />
}

export { Switch }
