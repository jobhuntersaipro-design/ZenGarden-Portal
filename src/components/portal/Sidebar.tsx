"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LinkSpinner } from "@/components/portal/LinkSpinner";
import { UserMenu } from "@/components/portal/UserMenu";
import { Wordmark } from "@/components/portal/Wordmark";
import { NAV, isActive } from "@/components/portal/nav";

/**
 * The desktop sidebar, from `lg` up.
 *
 * Below `lg` this used to collapse to a 64px icon rail, which cost 16% of a
 * 390px viewport for four unlabelled glyphs and left the page 246px to work
 * with — the single measurement behind most of the 2026-09-06 mobile review.
 * Small screens get `MobileTopBar` + `MobileTabBar` instead, so the rail is
 * gone and this component is only ever rendered at its full width.
 */
export function Sidebar({
  userName,
  userEmail,
  userImage = null,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
}) {
  const pathname = usePathname();

  return (
    // Sticky, not merely tall: the shell grows with the page, so a plain
    // `h-dvh` aside stopped at the fold and left the sidebar's surface and
    // right border hanging in the middle of a long dashboard. Pinned to the
    // top it fills the screen at every scroll position, and the nav and user
    // menu stay reachable from the bottom of the page.
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-xl self-start border-r border-hairline bg-surface px-md py-lg lg:flex">
      {/* The wordmark is the way home: the dashboard lives at `/`. */}
      <Link
        href="/"
        aria-label="Loving Hands — go to the dashboard"
        className="block rounded-xxs px-xs transition-opacity duration-[0.25s] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Wordmark />
      </Link>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-xxs overflow-y-auto"
        aria-label="Main"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-11 items-center gap-sm rounded-sm px-sm text-[length:var(--text-body-sm)] transition-colors duration-[0.25s] ease-[cubic-bezier(0.5,0,0.5,1)] focus-visible:outline-2 focus-visible:outline-focus ${
                active
                  ? "bg-surface-soft font-semibold text-ink"
                  : "font-medium text-ink-secondary hover:bg-canvas hover:text-ink"
              }`}
            >
              <Icon
                className="size-5 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              <span>{label}</span>
              {/* Spins from the click until the route commits and its
                  loading.tsx takes over. */}
              <LinkSpinner className="ml-auto" />
            </Link>
          );
        })}
      </nav>

      <UserMenu name={userName} email={userEmail} image={userImage} />
    </aside>
  );
}
