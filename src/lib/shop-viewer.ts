import { Role } from "@/generated/prisma/enums";
import { getSessionUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";

export type ShopViewer =
  | { kind: "guest" }
  | { kind: "client"; id: string; name: string; email: string; image: string | null; buyerId: string; buyerName: string };

export const GUEST: ShopViewer = { kind: "guest" };

/**
 * Who is looking at the shop. "staff" is returned rather than a viewer so the
 * layout can redirect them to the portal — the half-state a member browsing
 * the shop would create is the one 15 §3.2 removed, and it stays removed.
 *
 * Reads the row, not the token, for the same reason `requireClient` does:
 * a revoked contact has to stop now, not within five minutes.
 */
export async function loadShopViewer(): Promise<ShopViewer | "staff"> {
  const session = await getSessionUser();
  if (!session) return GUEST;
  if (session.role !== Role.CLIENT) return "staff";
  const row = await prisma.user.findUnique({
    where: { id: session.id },
    select: { name: true, email: true, image: true, buyerId: true, buyer: { select: { name: true } } },
  });
  if (!row?.buyerId || !row.buyer) return GUEST;
  return { kind: "client", id: session.id, name: row.name, email: row.email, image: row.image, buyerId: row.buyerId, buyerName: row.buyer.name };
}
