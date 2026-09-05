import type { ReactNode } from "react";
import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/portal/Sidebar";

/** Hard-coded to the seeded super admin until Phase 02 provides a session. */
async function getSignedInUser() {
  try {
    const user = await prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
      select: { name: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    if (user) return user;
  } catch {
    // Database unreachable — the shell still has to render.
  }
  return { name: "Loving Hands", email: "ops@lovinghandsportal.com" };
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await getSignedInUser();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar userName={user.name} userEmail={user.email} />
        <main className="min-w-0 flex-1 p-xl">
          <div className="mx-auto w-full max-w-[var(--container-page)]">{children}</div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
