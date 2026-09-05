import Link from "next/link";
import { Wordmark } from "@/components/portal/Wordmark";
import { Button } from "@/components/ui/button";

/**
 * The app's 404. `src/proxy.ts` rewrites `/admin` here for members, so this
 * page is what hides the admin section rather than a 403 that would confirm
 * the route exists.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-md bg-surface px-md text-center">
      <Wordmark />
      <h1 className="text-[length:var(--text-display-md)] font-display font-[650] tracking-[-1.36px] text-ink">
        Page not found
      </h1>
      <p className="max-w-[42ch] text-[length:var(--text-body-md)] text-ink-secondary">
        The page you asked for does not exist, or you do not have access to it.
      </p>
      <Button asChild>
        <Link href="/">Back to the dashboard</Link>
      </Button>
    </main>
  );
}
