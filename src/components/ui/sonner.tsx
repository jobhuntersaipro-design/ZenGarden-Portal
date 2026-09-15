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
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
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
          // Per-type colours, one accent token each — the icon and text
          // inherit `color` from the toast root under `data-rich-colors`
          // (sonner's own stylesheet sets `[data-title]`/`[data-description]`
          // to `color: inherit` in that mode), so setting the three vars
          // below is enough to recolour the whole toast, not just its icon.
          "--success-bg": "var(--color-surface-success)",
          "--success-border": "var(--color-accent-green)",
          "--success-text": "var(--color-accent-green)",
          "--warning-bg": "var(--color-surface-warning)",
          "--warning-border": "var(--color-brand-amber)",
          "--warning-text": "var(--color-brand-amber)",
          "--error-bg": "var(--color-surface-danger)",
          "--error-border": "var(--color-accent-red)",
          "--error-text": "var(--color-accent-red)",
          "--info-bg": "var(--color-surface-info)",
          "--info-border": "var(--color-accent-blue)",
          "--info-text": "var(--color-accent-blue)",
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
