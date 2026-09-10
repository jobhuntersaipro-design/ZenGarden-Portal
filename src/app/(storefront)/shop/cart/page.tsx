import { CartTable } from "@/components/shop/CartTable";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { loadCart } from "@/lib/queries/cart";

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const { id: userId, buyerId } = await requireClient();
  const [, cart] = await Promise.all([
    prisma.buyer.findUnique({ where: { id: buyerId }, select: { name: true } }),
    loadCart(userId),
  ]);

  return (
    <main>
      <h1 className="mb-md font-display text-[length:var(--text-heading-md)] text-ink">
        Your order
      </h1>
      <CartTable cart={cart} />
    </main>
  );
}
