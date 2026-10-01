"use client"

import * as React from "react"
import { Slot } from "radix-ui"
import { cn } from "cn"
import { Button as ArcButton, type ButtonSize, type ButtonVariant } from "@/components/arc/button/button"
import arcStyles from "@/components/arc/button/button.module.css"
import { useHeldFlag } from "@/hooks/useHeldFlag"

/**
 * Every button in the app: Arc's button — the 20px pill, the spring press and
 * a label that morphs (docs/specs/61-arc-preview-switch.md). The variant and
 * size names are the shadcn ones the app was written against, mapped onto
 * Arc's three variants and three sizes.
 */
type Variant = "default" | "gradient" | "secondary" | "outline" | "ghost" | "link" | "destructive"
type Size = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

const ARC_VARIANT: Record<Variant, ButtonVariant> = {
  default: "primary",
  gradient: "primary",
  secondary: "secondary",
  outline: "secondary",
  ghost: "ghost",
  link: "ghost",
  destructive: "danger",
}

const ARC_SIZE: Record<Size, ButtonSize> = {
  default: "md",
  icon: "md",
  xs: "sm",
  sm: "sm",
  "icon-xs": "sm",
  "icon-sm": "sm",
  lg: "lg",
  "icon-lg": "lg",
}

type ButtonProps = React.ComponentProps<"button"> & {
  variant?: Variant | null
  size?: Size | null
  asChild?: boolean
  /**
   * The button is waiting on the network. It shows Arc's spinner, marks
   * itself `aria-busy` and swallows presses — the caller still swaps the
   * words ("Saving…"), because the label names the work and the ring only
   * says that it is happening. The spinner stays at least 200ms
   * (`useHeldFlag`), so a fast save still shows it worked. Ignored with `asChild`: a Link shows its own
   * progress through `LinkSpinner`.
   */
  pending?: boolean
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  pending = false,
  disabled,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const held = useHeldFlag(pending)
  const arcVariant = ARC_VARIANT[variant ?? "default"]
  const arcSize = ARC_SIZE[size ?? "default"]
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
      loading={held}
      disabled={disabled}
      className={classes}
    >
      {children}
    </ArcButton>
  )
}

export { Button }
export type { ButtonProps }
