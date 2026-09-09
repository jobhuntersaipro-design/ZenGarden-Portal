import { Wordmark } from "@/components/portal/Wordmark";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

/**
 * A placeholder until Phase 16 builds the catalogue, cart and orders. It
 * exists so the shop host serves something truthful the moment Phase 15
 * deploys, rather than a 404 that looks like a broken invite.
 */
export default async function ShopHome() {
  const { buyerId } = await requireClient();
  const buyer = await prisma.buyer.findUnique({
    where: { id: buyerId },
    select: { name: true },
  });

  return (
    <main className="mx-auto max-w-panel-md py-xl">
      <Wordmark />
      <h1 className="mt-lg font-display text-[length:var(--text-display-md)] text-ink">
        You&rsquo;re signed in
      </h1>
      <p className="mt-sm text-[length:var(--text-body-md)] text-ink-secondary">
        {buyer?.name
          ? `This is the Loving Hands shop for ${buyer.name}.`
          : "This is the Loving Hands shop."}
      </p>
      <p className="mt-xs text-[length:var(--text-body-sm)] text-ink-tertiary">
        Browsing the catalogue and placing orders arrives shortly. Until then,
        send your purchase orders the way you do now and the team will key them
        in.
      </p>
    </main>
  );
}
