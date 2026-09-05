import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth-guards";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
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
      <Toaster />
    </TooltipProvider>
  );
}
