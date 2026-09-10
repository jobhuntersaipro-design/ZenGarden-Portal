"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/ui/person";

/**
 * One entry in the menu, or a separator. Ordered and passed in by the
 * caller (§5.7) so a later phase inserts a row — 19's *Purchase orders*, 20's
 * boxed *Reorder your last order* lead, 21's *Your company* section — without
 * this file changing at all.
 */
export type ShopAccountMenuRow =
  | { key: string; separator: true }
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      href?: string;
      onSelect?: () => void;
      /** Opens outside the app (e.g. `mailto:`) — a plain `<a>`, not `<Link>`, and carries the external glyph. */
      external?: boolean;
      /** The bordered, brand-link-coloured lead row (Phase 20's "Reorder your last order"). */
      boxed?: boolean;
    };

export function ShopAccountMenu({
  name,
  email,
  image,
  buyerName,
  rows,
}: {
  name: string;
  email: string;
  image: string | null;
  buyerName: string;
  rows: ShopAccountMenuRow[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        title={email}
        className="flex min-h-11 items-center gap-xxs rounded-pill p-xxs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <PersonAvatar name={name} image={image} size="md" className="size-9" />
        <ChevronDown className="size-3.5 text-ink-tertiary" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-full max-w-panel-xs rounded-md border border-hairline p-xs shadow-md"
      >
        <div className="flex items-center gap-sm px-xs pt-xxs pb-sm">
          <PersonAvatar name={name} image={image} size="md" className="size-10 shrink-0" />
          <div className="min-w-0">
            <p
              className="truncate text-[length:var(--text-body-sm)] font-semibold text-ink"
              title={name}
            >
              {name}
            </p>
            <p className="mt-xxs flex items-center gap-xxs">
              <span className="size-1.5 shrink-0 rounded-full bg-accent-green" aria-hidden />
              <span
                className="truncate text-[length:var(--text-caption)] text-ink-tertiary"
                title={buyerName}
              >
                {buyerName}
              </span>
            </p>
          </div>
        </div>

        {rows.map((row) => {
          if ("separator" in row) return <DropdownMenuSeparator key={row.key} />;

          const Icon = row.icon;
          const rowClassName = cn(
            "flex h-control-md items-center gap-sm rounded-sm px-sm text-[length:var(--text-body-sm)] text-ink",
            row.boxed && "mb-xs border border-hairline text-brand-link font-semibold",
          );
          const content = (
            <>
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">{row.label}</span>
              {row.external ? (
                <ExternalLink className="size-3.5 shrink-0 text-ink-tertiary" aria-hidden />
              ) : null}
            </>
          );

          if (row.href) {
            return (
              <DropdownMenuItem key={row.key} asChild className={rowClassName}>
                {row.external ? (
                  <a href={row.href}>{content}</a>
                ) : (
                  <Link href={row.href}>{content}</Link>
                )}
              </DropdownMenuItem>
            );
          }

          return (
            <DropdownMenuItem key={row.key} onSelect={row.onSelect} className={rowClassName}>
              {content}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
