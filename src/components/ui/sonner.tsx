"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Sonner only paints `--success-bg` etc. when `data-rich-colors` is set
      // — without this the four variable blocks below are inert and every
      // toast keeps rendering in the neutral `--normal-*` popover colours
      // whatever type it is, which was the whole defect.
      richColors
      // Each icon gets its own accent directly, rather than inheriting the
      // toast root's `color` the way sonner's title/description do (both are
      // `color: inherit` in its own stylesheet) — because the root's colour
      // is now `ink` (see `--success-text` etc. below, and the surface-tint
      // comment in globals.css for why), and an icon needs to stay a colour,
      // not fade to the same ink as the words beside it. Danger and success
      // keep the plain accent, which already clears 3:1 on their tints;
      // warning and info take the `-strong` variant, because `brand-amber`
      // and `accent-blue` do not.
      icons={{
        success: (
          <CircleCheckIcon className="size-4 text-accent-green" />
        ),
        info: (
          <InfoIcon className="size-4 text-accent-blue-strong" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4 text-brand-amber-strong" />
        ),
        error: (
          <OctagonXIcon className="size-4 text-accent-red" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          // Text is `ink` on every type, not the accent: measured, the
          // accent-on-tint pairs run 1.95:1–3.67:1, all short of the 4.5:1
          // normal-text floor, where `ink` clears 11.68:1 or better on all
          // four tints (see globals.css). The border keeps the plain accent
          // — a boundary carries no contrast requirement — and each icon's
          // own colour is set directly above rather than through these
          // variables.
          "--success-bg": "var(--color-surface-success)",
          "--success-border": "var(--color-accent-green)",
          "--success-text": "var(--color-ink)",
          "--warning-bg": "var(--color-surface-warning)",
          "--warning-border": "var(--color-brand-amber)",
          "--warning-text": "var(--color-ink)",
          "--error-bg": "var(--color-surface-danger)",
          "--error-border": "var(--color-accent-red)",
          "--error-text": "var(--color-ink)",
          "--info-bg": "var(--color-surface-info)",
          "--info-border": "var(--color-accent-blue)",
          "--info-text": "var(--color-ink)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
