"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "@/components/portal/UserMenu";
import { Wordmark } from "@/components/portal/Wordmark";
import { NAV, isActive } from "@/components/portal/nav";

/**
 * The mobile shell, below `lg`. The desktop `Sidebar` used to collapse into a
 * 64px icon rail here; four unlabelled glyphs are not worth 16% of a 390px
 * screen, and with 40px of page padding either side it left content 246px.
 *
 * Identity and account go to a top bar, destinations to a bottom tab bar where
 * a thumb can reach them. Both are `lg:hidden`; the sidebar takes over above.
 */

/** Wordmark and account, sticky so the way home survives a 5,000px page. */
export function MobileTopBar({
  userName,
  userEmail,
  userImage = null,
}: {
  userName: string;
  userEmail: string;
  userImage?: string | null;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex h-topbar shrink-0 items-center justify-between gap-md border-b border-hairline bg-surface px-md lg:hidden"
      // The bar is painted under the status bar on a notched phone, so its
      // background has to reach into the inset even though its content does not.
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Link
        href="/"
        aria-label="Loving Hands — go to the dashboard"
        className="flex min-h-control-md items-center rounded-xxs transition-opacity duration-[0.25s] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <Wordmark />
      </Link>
      {/* `collapsed` drops the name and address: the avatar alone is the whole
          control here, and the menu behind it carries Sign out. */}
      <div className="shrink-0">
        <UserMenu
          name={userName}
          email={userEmail}
          image={userImage}
          collapsed
        />
      </div>
    </header>
  );
}

/**
 * Four destinations across the bottom. Each tab is a 56px row plus the home
 * indicator inset, comfortably past the 44px touch minimum the review found 55
 * violations of.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-hairline bg-surface lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map(({ href, short, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            // The visible label is the short one; the accessible name is the
            // full one, so "Orders" does not become the only thing a screen
            // reader ever hears for Purchase Orders.
            aria-label={label}
            className={`flex h-14 flex-col items-center justify-center gap-xxs px-xxs transition-colors duration-[0.25s] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
              active ? "text-ink" : "text-ink-tertiary"
            }`}
          >
            <Icon
              className="size-5 shrink-0"
              strokeWidth={active ? 2.25 : 1.75}
              aria-hidden
            />
            <span
              aria-hidden
              className={`text-[length:var(--text-caption)] ${active ? "font-semibold" : ""}`}
            >
              {short}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
