-- Booking confirmations (2026-10-08): uploaded and read like a PO scan, kept
-- in their own table and linked to nothing else.
--
-- Additive: one enum, one table, and the default permission-grant rows for
-- the three `bc.*` keys. Nothing existing is altered or dropped.
--
-- `roleCan` reads stored grants and does not fall back to the code defaults,
-- so these rows are what lets each role see and upload the moment the deploy
-- finishes. A super admin can already, because that role never reads the table.

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('UPLOADING', 'EXTRACTING', 'NEEDS_REVIEW', 'FAILED', 'REVIEWED');

-- CreateTable
CREATE TABLE "BookingConfirmation" (
    "id" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'UPLOADING',
    "error" TEXT,
    "rawJson" JSONB,
    "bookingNumber" TEXT,
    "carrier" TEXT,
    "containers" TEXT,
    "portOfLoading" TEXT,
    "transhipmentPort" TEXT,
    "portOfDischarge" TEXT,
    "etdPol" DATE,
    "etaPod" DATE,
    "finalDestination" TEXT,
    "etaFinalDestination" DATE,
    "feederVessel" TEXT,
    "motherVessel" TEXT,
    "vesselTracking" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingConfirmation_r2Key_key" ON "BookingConfirmation"("r2Key");

-- CreateIndex
CREATE INDEX "BookingConfirmation_status_idx" ON "BookingConfirmation"("status");

-- CreateIndex
CREATE INDEX "BookingConfirmation_uploadedAt_idx" ON "BookingConfirmation"("uploadedAt");

-- AddForeignKey
ALTER TABLE "BookingConfirmation" ADD CONSTRAINT "BookingConfirmation_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingConfirmation" ADD CONSTRAINT "BookingConfirmation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
  ('SUPER_ADMIN', 'bc.view', true, NOW()),
  ('PRODUCTION_PLANNER', 'bc.view', true, NOW()),
  ('QC', 'bc.view', true, NOW()),
  ('WAREHOUSE', 'bc.view', true, NOW()),
  ('MEMBER', 'bc.view', true, NOW()),
  ('SUPER_ADMIN', 'bc.upload', true, NOW()),
  ('PRODUCTION_PLANNER', 'bc.upload', true, NOW()),
  ('QC', 'bc.upload', true, NOW()),
  ('WAREHOUSE', 'bc.upload', true, NOW()),
  ('MEMBER', 'bc.upload', false, NOW()),
  ('SUPER_ADMIN', 'bc.review', true, NOW()),
  ('PRODUCTION_PLANNER', 'bc.review', false, NOW()),
  ('QC', 'bc.review', false, NOW()),
  ('WAREHOUSE', 'bc.review', false, NOW()),
  ('MEMBER', 'bc.review', false, NOW())
ON CONFLICT ("role", "action") DO NOTHING;
