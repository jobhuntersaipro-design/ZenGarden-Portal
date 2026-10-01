"use client"

import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "cn"
import { Button as ArcButton, type ButtonSize, type ButtonVariant } from "@/components/arc/button/button"
import arcStyles from "@/components/arc/button/button.module.css"
import { useIsArc } from "@/components/ui-mode/UiModeProvider"
import { ButtonClassic, type ButtonProps } from "./button-classic"

/**
 * Every button in the app. Under the preview switch's Arc mode
 * (docs/specs/61-arc-preview-switch.md) it is Arc's button: the 20px pill,
 * the spring press and a label that morphs. Otherwise the shadcn button,
 * unchanged. `buttonVariants` lives in `button-classic.tsx`: a value exported
 * from this client module would not be that value in a server component.
 */
const ARC_VARIANT: Record<string, ButtonVariant> = {
  default: "primary",
  gradient: "primary",
  secondary: "secondary",
  outline: "secondary",
  ghost: "ghost",
  link: "ghost",
  destructive: "danger",
}

const ARC_SIZE: Record<string, ButtonSize> = {
  xs: "sm",
  sm: "sm",
  "icon-xs": "sm",
  "icon-sm": "sm",
  lg: "lg",
  "icon-lg": "lg",
}

function Button(props: ButtonProps) {
  const arc = useIsArc()
  if (!arc) return <ButtonClassic {...props} />
  const {
    className,
    variant = "default",
    size = "default",
    asChild = false,
    pending = false,
    disabled,
    children,
    ref,
    ...rest
  } = props
  const arcVariant = ARC_VARIANT[variant ?? "default"] ?? "primary"
  const arcSize = ARC_SIZE[size ?? "default"] ?? "md"
  // A square icon button drops Arc's side padding; the caller sizes it.
  const iconOnly = size?.startsWith("icon")
  const classes = cn(iconOnly && "px-0", className)
  const data = { "data-slot": "button", "data-variant": variant, "data-size": size }
  if (asChild) {
    // A Link styled as a button: Arc's own classes on the caller's element.
    return (
      <Slot.Root
        {...data}
        {...rest}
        ref={ref}
        aria-disabled={disabled || undefined}
        className={cn(arcStyles.button, arcStyles[arcVariant], arcStyles[arcSize], classes)}
      >
        {children}
      </Slot.Root>
    )
  }
  return (
    <ArcButton
      {...data}
      {...(rest as React.ComponentProps<typeof ArcButton>)}
      ref={ref as React.Ref<HTMLButtonElement>}
      variant={arcVariant}
      size={arcSize}
      loading={pending}
      disabled={disabled}
      className={classes}
    >
      {children}
    </ArcButton>
  )
}

export { Button }
export type { ButtonProps }
