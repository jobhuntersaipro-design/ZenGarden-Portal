import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NavProgressProvider } from "@/components/portal/NavProgress";
import { Sidebar } from "@/components/portal/Sidebar";

export default async function PortalLayout({ children }: { children: ReactNode }) {
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
        <div className="flex min-h-dvh bg-canvas">
          <Sidebar
            userName={user.name}
            userEmail={user.email}
            userImage={user.image}
          />
          <main className="min-w-0 flex-1 p-xl">
            <div className="mx-auto w-full max-w-[var(--container-page)]">{children}</div>
          </main>
        </div>
      </NavProgressProvider>
      <Toaster />
    </TooltipProvider>
  );
}
