-- Phase 68: containers on a shipment, with photos and videos the buyer sees.
-- The PurchaseOrder_documentId_fkey drift Prisma proposes is cut out, as every migration since Phase 16.
-- CreateEnum
CREATE TYPE "ContainerMediaKind" AS ENUM ('PHOTO', 'VIDEO');

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "containerNo" TEXT,
    "sealNo" TEXT,
    "size" TEXT,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerMedia" (
    "id" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "kind" "ContainerMediaKind" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "thumbKey" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContainerMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Container_shipmentId_idx" ON "Container"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerMedia_r2Key_key" ON "ContainerMedia"("r2Key");

-- CreateIndex
CREATE INDEX "ContainerMedia_containerId_uploadedAt_idx" ON "ContainerMedia"("containerId", "uploadedAt");

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMedia" ADD CONSTRAINT "ContainerMedia_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerMedia" ADD CONSTRAINT "ContainerMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

