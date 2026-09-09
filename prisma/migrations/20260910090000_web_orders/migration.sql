-- Phase 16. Orders placed on the shop.

CREATE TYPE "WebOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'DECLINED');

-- An order placed on the shop has no scan behind it. @unique still holds:
-- Postgres permits many NULLs in a unique index, so one-PO-per-document
-- survives. Every join on this column must become a LEFT JOIN, or web orders
-- disappear from the purchase-order list with no error and no type failure.
ALTER TABLE "PurchaseOrder" ALTER COLUMN "documentId" DROP NOT NULL;

CREATE TABLE "WebOrder" (
  "id"              TEXT NOT NULL,
  "seq"             SERIAL NOT NULL,
  "reference"       TEXT NOT NULL,
  "buyerId"         TEXT NOT NULL,
  "placedById"      TEXT NOT NULL,
  "status"          "WebOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "buyerReference"  TEXT,
  "requestedDate"   DATE,
  "notes"           TEXT,
  "currency"        TEXT NOT NULL DEFAULT 'MYR',
  "subtotal"        DECIMAL(14,2) NOT NULL DEFAULT 0,
  "submittedAt"     TIMESTAMP(3),
  "reviewedById"    TEXT,
  "reviewedAt"      TIMESTAMP(3),
  "declinedReason"  TEXT,
  "purchaseOrderId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebOrderLine" (
  "id"         TEXT NOT NULL,
  "webOrderId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "cartons"    INTEGER NOT NULL,
  "packSize"   INTEGER,
  "unit"       TEXT NOT NULL DEFAULT 'carton',
  "unitPrice"  DECIMAL(14,4) NOT NULL DEFAULT 0,
  "amount"     DECIMAL(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT "WebOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebOrder_reference_key" ON "WebOrder"("reference");
CREATE UNIQUE INDEX "WebOrder_purchaseOrderId_key" ON "WebOrder"("purchaseOrderId");
CREATE INDEX "WebOrder_status_submittedAt_idx" ON "WebOrder"("status", "submittedAt");
CREATE INDEX "WebOrder_buyerId_submittedAt_idx" ON "WebOrder"("buyerId", "submittedAt");

-- One open cart per client. Prisma cannot express a partial index.
CREATE UNIQUE INDEX "WebOrder_one_draft_per_user"
  ON "WebOrder" ("placedById") WHERE "status" = 'DRAFT';

-- Adding the same product twice is an upsert, not a duplicate row.
CREATE UNIQUE INDEX "WebOrderLine_webOrderId_productId_key" ON "WebOrderLine"("webOrderId", "productId");
CREATE INDEX "WebOrderLine_productId_idx" ON "WebOrderLine"("productId");

ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebOrderLine" ADD CONSTRAINT "WebOrderLine_webOrderId_fkey" FOREIGN KEY ("webOrderId") REFERENCES "WebOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebOrderLine" ADD CONSTRAINT "WebOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
