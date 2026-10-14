-- Product certification (2026-10-14). Additive, except confirmedById loses NOT NULL:
-- an auto-approved shop order has no person who confirmed it.
-- PurchaseOrder_documentId_fkey drift (since Phase 16) deliberately left out.

-- CreateEnum
CREATE TYPE "CertType" AS ENUM ('NOT', 'HL', 'COA');

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "confirmedById" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "type" "CertType" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "reference" TEXT,
    "expiresOn" DATE NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateOverride" (
    "productId" TEXT NOT NULL,
    "type" "CertType" NOT NULL,
    "reason" TEXT NOT NULL,
    "byId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateOverride_pkey" PRIMARY KEY ("productId","type")
);

-- CreateTable
CREATE TABLE "_CertificateToProduct" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CertificateToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_r2Key_key" ON "Certificate"("r2Key");

-- CreateIndex
CREATE INDEX "Certificate_type_expiresOn_idx" ON "Certificate"("type", "expiresOn");

-- CreateIndex
CREATE INDEX "_CertificateToProduct_B_index" ON "_CertificateToProduct"("B");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateOverride" ADD CONSTRAINT "CertificateOverride_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CertificateToProduct" ADD CONSTRAINT "_CertificateToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CertificateToProduct" ADD CONSTRAINT "_CertificateToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
