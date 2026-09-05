import { notFound } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import { PageHeader } from "@/components/portal/PageHeader";

/**
 * Stub until Phase 09. `src/proxy.ts` already rewrites this path to the 404 for
 * a member; the same answer is repeated here so the page is safe on its own —
 * a 404 rather than a 403, so nobody learns the route exists.
 */
export default async function AdminPage() {
  const user = await getSessionUser();
  if (user?.role !== Role.SUPER_ADMIN) notFound();

  return (
    <>
      <PageHeader eyebrow="Super admin" title="Admin" />
      <div className="rounded-lg border border-hairline bg-canvas p-lg">
        <p className="text-[length:var(--text-body-md)] text-ink">
          Users and access requests arrive in Phase 09.
        </p>
      </div>
    </>
  );
}
