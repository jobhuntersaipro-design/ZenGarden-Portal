-- Files kept against one purchase order (buyer specs and the like).
--
-- Additive: one new table, and the default permission-grant rows for
-- `po.document`. Nothing existing is altered or dropped.
--
-- Production applies this itself. vercel.json runs `prisma migrate deploy`
-- only when VERCEL_ENV=production, as part of the build, before `next build`.
-- A preview deployment does not migrate. There is no manual step on
-- production. `roleCan` reads stored grants and does not fall back to the
-- code defaults, so these rows are what lets planner, QC and warehouse
-- attach a file the moment the deploy finishes. A super admin can already,
-- because that role never reads the table.

CREATE TABLE "PurchaseOrderDocument" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderDocument_r2Key_key" ON "PurchaseOrderDocument"("r2Key");
CREATE INDEX "PurchaseOrderDocument_purchaseOrderId_createdAt_idx" ON "PurchaseOrderDocument"("purchaseOrderId", "createdAt");

ALTER TABLE "PurchaseOrderDocument" ADD CONSTRAINT "PurchaseOrderDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderDocument" ADD CONSTRAINT "PurchaseOrderDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
  ('SUPER_ADMIN', 'po.document', true, NOW()),
  ('PRODUCTION_PLANNER', 'po.document', true, NOW()),
  ('QC', 'po.document', true, NOW()),
  ('WAREHOUSE', 'po.document', true, NOW()),
  ('MEMBER', 'po.document', false, NOW())
ON CONFLICT ("role", "action") DO NOTHING;
