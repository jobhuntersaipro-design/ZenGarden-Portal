"use client";

import * as React from "react";
import { cn } from "cn";
import { Dialog as SheetPrimitive } from "radix-ui";
import arc from "@/components/arc/drawer/drawer.module.css";
import { useIsArc } from "@/components/ui-mode/UiModeProvider";

import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The panel's default width is applied in code, not in the class string,
 * because neither CSS nor `cn` can be relied on to let a caller override it.
 * shadcn ships it as `data-[side=right]:sm:max-w-sm`, which outranks a caller's
 * plain `sm:max-w-*` on specificity; dropping that prefix does not help either,
 * because tailwind-merge does not recognise this project's custom
 * `max-w-panel-*` names as one conflict group, so it keeps both and leaves the
 * winner to stylesheet order. Both were measured doing exactly that — the PO
 * edit drawer opened at 384px while asking for 512px. Checking for a
 * caller-supplied `max-w-` is the one deterministic option.
 *
 * **`overflow-y-auto` is on the base class, not on each caller (2026-09-24).**
 * A left or right sheet is `h-full`, so content taller than the viewport
 * simply hangs off the bottom with nothing to scroll. Four of the six callers
 * passed `overflow-y-auto` themselves and two did not — and on one of those
 * the drawer's own **Save details** sat at y=948 in an 844px viewport at 390,
 * unreachable, so a buyer's details could not be saved on a phone at all.
 * That is `context/lessons.md` §9: a fix every caller has to remember, with
 * the default on the side of the defect. It belongs here, where no caller can
 * forget it.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  const callerSetsWidth = /(?:^|\s)\S*max-w-/.test(className ?? "");
  const isArc = useIsArc();
  if (isArc) {
    // Arc mode: Arc's drawer — the rounded inner edge, floating shadow and
    // its critically damped slide (the keyframe path Arc uses under a plain
    // Radix root). It scrolls itself, so a tall form's Save stays reachable
    // on a phone (context/lessons.md §9).
    return (
      <SheetPortal>
        <SheetPrimitive.Overlay
          data-slot="sheet-overlay"
          className={cn(arc.overlay, arc.keyframes)}
        />
        <SheetPrimitive.Content
          data-slot="sheet-content"
          data-side={side}
          className={cn(
            arc.content,
            arc.keyframes,
            "gap-md overflow-y-auto",
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <SheetPrimitive.Close
              data-slot="sheet-close"
              className={cn(arc.close, "absolute top-md right-md max-sm:size-11")}
              aria-label="Close"
            >
              <XIcon className="size-4" aria-hidden />
            </SheetPrimitive.Close>
          )}
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  }
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto bg-popover bg-clip-padding text-sm text-popover-foreground shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10",
          !callerSetsWidth && "sm:max-w-panel-sm",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  const isArc = useIsArc();
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        isArc ? cn(arc.header, "flex-col gap-0 pr-xxl") : "flex flex-col gap-0.5 p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  const isArc = useIsArc();
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        isArc
          ? "mt-auto flex flex-col gap-xs border-t border-hairline p-lg"
          : "mt-auto flex flex-col gap-2 p-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  const isArc = useIsArc();
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        isArc ? arc.title : "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  const isArc = useIsArc();
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn(isArc ? arc.description : "text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
