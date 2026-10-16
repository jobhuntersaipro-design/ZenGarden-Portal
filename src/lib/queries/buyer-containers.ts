import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The containers a buyer sees on their order (Phase 68): every container with
 * media on a shipment carrying this order. **Dates only** — no staff name, no
 * file a buyer did not need. Pinned by equality in `buyer-containers.test.ts`,
 * so a later column reaches the shop only by a deliberate edit.
 */
export const BUYER_CONTAINER_SELECT = {
  id: true,
  containerNo: true,
  sealNo: true,
  size: true,
  description: true,
  updatedAt: true,
  media: {
    orderBy: { uploadedAt: "asc" },
    select: { id: true, kind: true, originalName: true, uploadedAt: true },
  },
} satisfies Prisma.ContainerSelect;

const scope = (buyerId: string, purchaseOrderId: string): Prisma.ContainerWhereInput => ({
  shipment: { buyerId, orders: { some: { purchaseOrderId, purchaseOrder: { buyerId } } } },
});

export function listBuyerContainers(buyerId: string, purchaseOrderId: string) {
  return prisma.container.findMany({
    where: { ...scope(buyerId, purchaseOrderId), media: { some: {} } },
    orderBy: { createdAt: "asc" },
    select: BUYER_CONTAINER_SELECT,
  });
}

export type BuyerContainer = Awaited<ReturnType<typeof listBuyerContainers>>[number];

/** One media row, only if it hangs off a container on this buyer's order. */
export function findBuyerContainerMedia(buyerId: string, purchaseOrderId: string, mediaId: string) {
  return prisma.containerMedia.findFirst({
    where: { id: mediaId, container: scope(buyerId, purchaseOrderId) },
    select: { r2Key: true, thumbKey: true, originalName: true },
  });
}
