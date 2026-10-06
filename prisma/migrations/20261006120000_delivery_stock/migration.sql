-- Cartons leave the shelf the first time a purchase order reaches Delivering
-- (out for delivery). `PurchaseOrder.stockDeductedAt` is the marker that a
-- second move — save twice, double click, or back and forward again — must
-- not deduct a second time. `StockMovement` is the log, one row per line,
-- unique on the order and the line so the database refuses a duplicate.
--
-- `Product.stockCartons` stays the on-hand cache. This migration does not
-- change its values: nothing has been deducted yet.

ALTER TABLE "PurchaseOrder" ADD COLUMN "stockDeductedAt" TIMESTAMP(3);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "beforeCartons" INTEGER NOT NULL,
    "afterCartons" INTEGER NOT NULL,
    "poNumber" TEXT,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StockMovement_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "StockMovement_balances" CHECK ("afterCartons" = "beforeCartons" - "quantity"),
    CONSTRAINT "StockMovement_after_non_negative" CHECK ("afterCartons" >= 0)
);

CREATE UNIQUE INDEX "StockMovement_purchaseOrderId_lineItemId_key"
    ON "StockMovement"("purchaseOrderId", "lineItemId");
CREATE INDEX "StockMovement_productId_createdAt_idx"
    ON "StockMovement"("productId", "createdAt");
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lineItemId_fkey"
    FOREIGN KEY ("lineItemId") REFERENCES "LineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
