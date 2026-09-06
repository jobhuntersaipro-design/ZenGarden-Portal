import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NavProgressProvider } from "@/components/portal/NavProgress";
import { MobileTabBar, MobileTopBar } from "@/components/portal/MobileNav";
import { SkipLink } from "@/components/portal/SkipLink";
import { Sidebar } from "@/components/portal/Sidebar";

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

  return (
    <TooltipProvider delayDuration={200}>
      {/* Every in-place filter, sort, range and page change reports its
          transition here, so one indicator covers the whole shell (brief G1).
          The sidebar sits inside it but is never disabled by it: a slow query
          on one screen must not block navigating away from that screen. */}
      <NavProgressProvider>
        <SkipLink />
        <div className="flex min-h-dvh bg-canvas">
          <Sidebar
            userName={user.name}
            userEmail={user.email}
            userImage={user.image}
          />
          {/* `min-w-0` on the column, not just the main: a flex child defaults
              to `min-width: auto`, so without it a wide table would widen the
              shell instead of scrolling inside its own container. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <MobileTopBar
              userName={user.name}
              userEmail={user.email}
              userImage={user.image}
            />
            {/* Padding steps with the viewport. A flat `p-xl` spent 80px of a
                390px screen on margins — with the old 64px rail that left the
                page 246px (2026-09-06 review, A5). */}
            <main id="main" className="min-w-0 flex-1 p-md sm:p-lg lg:p-xl">
              <div className="mx-auto w-full max-w-[var(--container-page)]">
                {children}
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
        <MobileTabBar />
      </NavProgressProvider>
      <Toaster />
    </TooltipProvider>
  );
}
