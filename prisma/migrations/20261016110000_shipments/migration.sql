-- CreateEnum
CREATE TYPE "ShipmentDocType" AS ENUM ('INVOICE', 'PACKING_LIST', 'CUSTOMS_FORM', 'BILL_OF_LADING', 'FORM_D');

-- AlterTable
ALTER TABLE "BookingConfirmation" ADD COLUMN     "shipmentId" TEXT;

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "market" TEXT,
    "formDRequired" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentOrder" (
    "shipmentId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentOrder_pkey" PRIMARY KEY ("shipmentId","purchaseOrderId")
);

-- CreateTable
CREATE TABLE "ShipmentDocument" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "type" "ShipmentDocType" NOT NULL,
    "label" TEXT,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(3),

    CONSTRAINT "ShipmentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_reference_key" ON "Shipment"("reference");

-- CreateIndex
CREATE INDEX "Shipment_buyerId_idx" ON "Shipment"("buyerId");

-- CreateIndex
CREATE INDEX "Shipment_createdAt_idx" ON "Shipment"("createdAt");

-- CreateIndex
CREATE INDEX "ShipmentOrder_purchaseOrderId_idx" ON "ShipmentOrder"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentDocument_r2Key_key" ON "ShipmentDocument"("r2Key");

-- CreateIndex
CREATE INDEX "ShipmentDocument_shipmentId_type_supersededAt_idx" ON "ShipmentDocument"("shipmentId", "type", "supersededAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_at_idx" ON "ShipmentEvent"("shipmentId", "at");

-- CreateIndex
CREATE INDEX "BookingConfirmation_shipmentId_idx" ON "BookingConfirmation"("shipmentId");

-- AddForeignKey
ALTER TABLE "BookingConfirmation" ADD CONSTRAINT "BookingConfirmation_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentOrder" ADD CONSTRAINT "ShipmentOrder_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentOrder" ADD CONSTRAINT "ShipmentOrder_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 63: every booking already linked to a purchase order becomes a
-- one-order shipment, so no link is lost. Reference SHP-YYMM-NNNN from the
-- booking's upload month and the shipment's own sequence.
INSERT INTO "Shipment" ("id", "reference", "buyerId", "market", "formDRequired", "createdById", "createdAt", "updatedAt")
SELECT 'shp_' || bc."id", 'pending-' || bc."id", po."buyerId", b."market",
       COALESCE(b."market" ILIKE '%indo%', false), bc."uploadedById", bc."uploadedAt", NOW()
FROM "BookingConfirmation" bc
JOIN "PurchaseOrder" po ON po."id" = bc."purchaseOrderId"
JOIN "Buyer" b ON b."id" = po."buyerId"
WHERE bc."purchaseOrderId" IS NOT NULL;

UPDATE "Shipment"
SET "reference" = 'SHP-' || to_char("createdAt", 'YYMM') || '-' || lpad("seq"::text, 4, '0')
WHERE "reference" LIKE 'pending-%';

INSERT INTO "ShipmentOrder" ("shipmentId", "purchaseOrderId")
SELECT 'shp_' || "id", "purchaseOrderId" FROM "BookingConfirmation" WHERE "purchaseOrderId" IS NOT NULL;

UPDATE "BookingConfirmation" SET "shipmentId" = 'shp_' || "id" WHERE "purchaseOrderId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "BookingConfirmation" DROP CONSTRAINT "BookingConfirmation_purchaseOrderId_fkey";

-- DropIndex
DROP INDEX "BookingConfirmation_purchaseOrderId_idx";

-- AlterTable
ALTER TABLE "BookingConfirmation" DROP COLUMN "purchaseOrderId";

-- `roleCan` reads stored grants only.
INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
  ('SUPER_ADMIN', 'shipment.view', true, NOW()),
  ('PRODUCTION_PLANNER', 'shipment.view', true, NOW()),
  ('QC', 'shipment.view', true, NOW()),
  ('WAREHOUSE', 'shipment.view', true, NOW()),
  ('MEMBER', 'shipment.view', true, NOW()),
  ('SUPER_ADMIN', 'shipment.manage', true, NOW()),
  ('PRODUCTION_PLANNER', 'shipment.manage', true, NOW()),
  ('QC', 'shipment.manage', true, NOW()),
  ('WAREHOUSE', 'shipment.manage', true, NOW()),
  ('MEMBER', 'shipment.manage', false, NOW())
ON CONFLICT ("role", "action") DO NOTHING;
