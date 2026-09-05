"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Package, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserMenu } from "@/components/portal/UserMenu";
import { Wordmark } from "@/components/portal/Wordmark";

/**
 * Destinations only. Upload is an action — the "Upload PO" primary in the page
 * header — never a nav row (00-master.md §4, design reference §3.0).
 */
const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/purchase-orders", label: "Purchase orders", icon: FileText },
  { href: "/buyers", label: "Buyers", icon: Users },
  { href: "/products", label: "Products", icon: Package },
] as const;

/** /upload and /review/[id] belong to the Purchase orders section. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/purchase-orders") {
    return (
      pathname.startsWith("/purchase-orders") ||
      pathname.startsWith("/upload") ||
      pathname.startsWith("/review")
    );
  }
  return pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-dvh w-16 shrink-0 flex-col gap-xl border-r border-hairline bg-surface px-xs py-lg lg:w-60 lg:px-md">
      <div className="px-xs">
        <Wordmark className="hidden lg:block" />
        <div className="lg:hidden" aria-hidden>
          <span className="bg-brand-gradient bg-clip-text font-display text-[length:var(--text-heading-md)] font-bold text-transparent">
            L
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-xxs" aria-label="Main">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const row = (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-sm rounded-sm px-sm text-[length:var(--text-body-sm)] transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] focus-visible:outline-2 focus-visible:outline-primary ${
                active
                  ? "bg-surface-soft font-semibold text-ink"
                  : "font-medium text-ink-secondary hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          );

          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{row}</TooltipTrigger>
              <TooltipContent side="right" className="lg:hidden">
                {label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <UserMenu name="Chris Lam" email="chris@lovinghandsportal.com" />
    </aside>
  );
}
