-- A buyer's logo and the documents staff keep against a buyer (2026-09-24).
--
-- Additive: three nullable columns on "Buyer" and one new table. Written by
-- hand, like the migrations before it, so `migrate dev` cannot fold in the
-- PurchaseOrder_documentId_fkey drift recorded since Phase 16.

ALTER TABLE "Buyer" ADD COLUMN "logoKey" TEXT,
ADD COLUMN "logoWidth" INTEGER,
ADD COLUMN "logoHeight" INTEGER;

CREATE TABLE "BuyerDocument" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuyerDocument_r2Key_key" ON "BuyerDocument"("r2Key");
CREATE INDEX "BuyerDocument_buyerId_folder_idx" ON "BuyerDocument"("buyerId", "folder");

ALTER TABLE "BuyerDocument" ADD CONSTRAINT "BuyerDocument_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuyerDocument" ADD CONSTRAINT "BuyerDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
