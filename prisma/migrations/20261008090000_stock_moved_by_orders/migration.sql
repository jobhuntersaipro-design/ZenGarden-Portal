-- An order going out for delivery takes its cartons off stock, and moving it
-- back puts them back. Each move is a ledger row like a count, carrying the
-- order and the figure before. Additive and nullable: every existing row is a
-- count, and stays one.
ALTER TABLE "StockCount" ADD COLUMN "fromCartons" INTEGER,
ADD COLUMN "purchaseOrderId" TEXT;

CREATE INDEX "StockCount_purchaseOrderId_idx" ON "StockCount"("purchaseOrderId");

ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
