import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/portal/Sidebar";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh bg-canvas">
        <Sidebar />
        <main className="min-w-0 flex-1 p-xl">
          <div className="mx-auto w-full max-w-[var(--container-page)]">{children}</div>
        </main>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
