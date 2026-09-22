-- Phase 55. Stock counts become an append-only ledger with an author, a note
-- and the day they are a count of. `Product.stockCartons` stays as the cache
-- of the current count and is not touched here: it already holds whatever was
-- typed into the product drawer, and the first count entered against a product
-- supersedes it in meaning without a backfill guessing when it was taken.
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "countedOn" DATE NOT NULL,
    "cartons" INTEGER NOT NULL,
    "note" TEXT,
    "countedById" TEXT,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id"),
    -- Zero is a count; below zero is not a quantity.
    CONSTRAINT "StockCount_cartons_not_negative" CHECK ("cartons" >= 0)
);

CREATE UNIQUE INDEX "StockCount_supersedesId_key" ON "StockCount"("supersedesId");
CREATE INDEX "StockCount_productId_countedOn_idx" ON "StockCount"("productId", "countedOn");
CREATE INDEX "StockCount_countedOn_idx" ON "StockCount"("countedOn");

ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_countedById_fkey"
    FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_supersedesId_fkey"
    FOREIGN KEY ("supersedesId") REFERENCES "StockCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
