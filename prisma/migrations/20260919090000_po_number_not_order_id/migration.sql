-- The PO number is the buyer's own number, never our Order ID (2026-09-17).
-- Confirming a shop order wrote its Order ID (WebOrder.reference, "W-2609-…")
-- into PurchaseOrder.poNumber, and every screen then showed it as the PO.
ALTER TABLE "PurchaseOrder" ALTER COLUMN "poNumber" DROP NOT NULL;

-- Keep the buyer's PO on the purchase order where it was not already copied.
UPDATE "PurchaseOrder" AS po
SET "buyerReference" = wo."buyerReference"
FROM "WebOrder" AS wo
WHERE wo."purchaseOrderId" = po."id"
  AND po."buyerReference" IS NULL
  AND wo."buyerReference" IS NOT NULL;

-- Clear the Order ID out of poNumber. Only where it *is* the Order ID: before
-- the field was locked a reviewer could type the buyer's number over it, and
-- that value is kept.
UPDATE "PurchaseOrder" AS po
SET "poNumber" = NULL
FROM "WebOrder" AS wo
WHERE wo."purchaseOrderId" = po."id"
  AND po."poNumber" = wo."reference";
