import { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export type BuyerContact = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  disabledAt: Date | null;
  lastActiveAt: Date | null;
  /** True until they have signed in and set their own password. */
  invited: boolean;
};

/** The buyer's own staff who can sign in on the shop host. */
export async function listBuyerContacts(buyerId: string): Promise<BuyerContact[]> {
  const rows = await prisma.user.findMany({
    where: { buyerId, role: Role.CLIENT },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      disabledAt: true,
      lastActiveAt: true,
      mustChangePassword: true,
    },
    orderBy: { name: "asc" },
  });
  return rows.map(({ mustChangePassword, ...row }) => ({
    ...row,
    invited: mustChangePassword,
  }));
}
