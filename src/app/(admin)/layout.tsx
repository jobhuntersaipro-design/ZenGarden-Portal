import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { NavProgressProvider } from "@/components/portal/NavProgress";
import { Wordmark } from "@/components/portal/Wordmark";
import { PersonAvatar } from "@/components/ui/person";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getSessionUser } from "@/lib/auth-guards";

/**
 * Its own shell, without the portal sidebar: admin is not a destination in the
 * product, it is a separate room.
 *
 * `src/proxy.ts` already rewrites this path to a 404 for anyone who is not a
 * super admin. This check runs anyway — the proxy reads a JWT that can be up
 * to five minutes stale, and this one runs the `jwt` callback.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/signin?next=/admin");
  if (user.role !== Role.SUPER_ADMIN) redirect("/");

  return (
    <TooltipProvider delayDuration={200}>
      {/* The users table filters and sorts through the same URL machinery as
          the portal, so it gets the same progress bar (brief G1). */}
      <NavProgressProvider>
        <div className="min-h-dvh bg-canvas">
          <header className="flex h-topbar items-center gap-md border-b border-hairline px-lg">
            <Wordmark />
            <span className="font-mono text-[length:var(--text-eyebrow)] text-ink-tertiary">
              Admin
            </span>
            <Link
              href="/"
              className="ml-auto text-[length:var(--text-body-sm)] text-brand-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              ‹ Back to portal
            </Link>
            <PersonAvatar name={user.name} image={user.image} size="md" />
          </header>

          <main className="mx-auto w-full max-w-[var(--container-page)] p-xl">
            {children}
          </main>
        </div>
      </NavProgressProvider>
      <Toaster />
    </TooltipProvider>
  );
}
