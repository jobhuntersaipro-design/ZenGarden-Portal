import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { roleLabel } from "@/lib/permissions/roles";
import { getSessionUser } from "@/lib/auth-guards";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { reviewQueueCount } from "@/lib/queries/purchase-orders";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AvatarChangeListener } from "@/components/portal/AvatarBroadcast";
import { AvatarSavingProvider } from "@/components/portal/AvatarSaving";
import { NavProgressProvider } from "@/components/portal/NavProgress";
import { PullToRefresh } from "@/components/portal/PullToRefresh";
import { MobileTabBar, MobileTopBar } from "@/components/portal/MobileNav";
import { NAV } from "@/components/portal/nav";
import { roleCan } from "@/lib/permissions/require";
import { SkipLink } from "@/components/portal/SkipLink";
import { ReviewCountProvider } from "@/components/portal/ReviewCount";
import { Sidebar } from "@/components/portal/Sidebar";
import { PageTransition } from "@/components/portal/PageTransition";
import { WelcomeCard } from "@/components/portal/WelcomeCard";

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  // `src/proxy.ts` reads the JWT only. This is the check that actually runs the
  // `jwt` callback, so a disabled, deleted or signed-out-everywhere user stops
  // here even when their cookie still decodes.
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  if (user.mustChangePassword) redirect("/account/password");
  // A client has no buyer-scoped view of the portal and every query here is
  // unscoped by design, so they are sent to the shop rather than shown an
  // empty or — worse — a complete one. The proxy does this too; this is the
  // check that runs against a real session.
  if (user.role === Role.CLIENT) redirect(env.SHOP_URL ?? "/signin");

  // Name and picture come from the row, not the JWT. The token only re-reads
  // the database every REFRESH_INTERVAL_MS, so a change made on /settings
  // would otherwise sit stale in the shell for up to five minutes while every
  // table — which joins the row directly — already showed the new one. One
  // indexed lookup by primary key is the cheaper half of that trade.
  // The review queue's count rides alongside (Phase 46): the sidebar and the
  // Orders tab show it, and it is the same query the queue section runs.
  const [profile, reviewCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      // email and role ride along for the account menu's identity header.
      // The role is read here rather than taken from the token for the same
      // reason the name is: the JWT is up to five minutes stale, and a menu
      // that labels someone Member while still offering them the Admin row
      // would be contradicting itself.
      select: { name: true, image: true, email: true, role: true },
    }),
    reviewQueueCount(),
  ]);
  const displayName = profile?.name ?? user.name;
  const displayImage = profile?.image ?? null;
  const displayEmail = profile?.email ?? user.email ?? "";
  const displayRole = profile?.role ?? user.role;

  // Which destinations this role may open. The nav is a client component and
  // cannot read a permission itself, so the hrefs are resolved here and passed
  // down — a row that only ever 404s is worse than no row. `roleCan` is
  // `cache()`d per request, so these six checks share one read of the grid,
  // and `displayRole` is the row's own rather than the JWT's, which is up to
  // five minutes stale — the same trade the name and picture already make.
  const allowedNav = (
    await Promise.all(
      NAV.map(async (entry) => ({
        href: entry.href,
        allowed: await roleCan(displayRole, entry.permission),
      })),
    )
  )
    .filter((entry) => entry.allowed)
    .map((entry) => entry.href);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Every in-place filter, sort, range and page change reports its
          transition here, so one indicator covers the whole shell (brief G1).
          The sidebar sits inside it but is never disabled by it: a slow query
          on one screen must not block navigating away from that screen. */}
      <NavProgressProvider>
        {/* Wraps the shell *and* the page: /settings writes the flag, the
            sidebar and mobile top bar read it. */}
        <AvatarSavingProvider>
          {/* The review queue's count, for the sidebar and the tab bar; kept
              current from the browser because this layout is not re-rendered
              on a client-side navigation (Phase 46). */}
          <ReviewCountProvider initial={reviewCount}>
          {/* A picture changed in another tab has to reach this one. */}
          <AvatarChangeListener />
          <PullToRefresh />
          <SkipLink />
          <div className="flex min-h-dvh bg-canvas">
            <Sidebar
              userName={displayName}
              userEmail={displayEmail}
              userRoleName={roleLabel(displayRole)}
              userIsSuperAdmin={displayRole === Role.SUPER_ADMIN}
              userImage={displayImage}
              allowed={allowedNav}
            />
            {/* `min-w-0` on the column, not just the main: a flex child defaults
              to `min-width: auto`, so without it a wide table would widen the
              shell instead of scrolling inside its own container. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileTopBar
                userName={displayName}
                userEmail={displayEmail}
                userRoleName={roleLabel(displayRole)}
                userIsSuperAdmin={displayRole === Role.SUPER_ADMIN}
                userImage={displayImage}
              />
              {/* Padding steps with the viewport. A flat `p-xl` spent 80px of a
                390px screen on margins — with the old 64px rail that left the
                page 246px (2026-09-06 review, A5). */}
              <main id="main" className="min-w-0 flex-1 p-md sm:p-lg lg:p-xl">
                <div className="mx-auto w-full max-w-[var(--container-page)]">
                  {/* Once per sign-in, on whichever page it lands on, until
                      closed. A token minted before sign-ins were stamped keys
                      on "earlier", so those sessions see it once as well. */}
                  <WelcomeCard
                    firstName={displayName.split(/\s+/)[0] || displayName}
                    loginId={`${user.id}:${user.signedInAt ?? "earlier"}`}
                  />
                  <PageTransition>{children}</PageTransition>
                </div>
              </main>
              {/* The tab bar is fixed, so it paints over the end of the page
                unless the page reserves its height — 56px plus the home
                indicator. Nothing to reserve once the bar is gone at `lg`. */}
              <div
                aria-hidden
                className="lg:hidden"
                style={{ height: "calc(3.5rem + env(safe-area-inset-bottom))" }}
              />
            </div>
          </div>
          <MobileTabBar allowed={allowedNav} />
          </ReviewCountProvider>
        </AvatarSavingProvider>
      </NavProgressProvider>
      <Toaster />
    </TooltipProvider>
  );
}
