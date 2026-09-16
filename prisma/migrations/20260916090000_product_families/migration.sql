-- A product line at one size, across every market
-- (docs/specs/36-product-families.md §1).
--
-- Additive. No backfill here: assigning the existing products needs
-- `groupName`'s suffix logic, which lives in TypeScript, and the collisions
-- need a person — `scripts/backfill-product-families.ts` proposes, reports,
-- and applies only what a person has reviewed.

CREATE TABLE "ProductFamily" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "size" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFamily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductFamily_code_key" ON "ProductFamily"("code");

ALTER TABLE "Product" ADD COLUMN "familyId" TEXT;

CREATE INDEX "Product_familyId_idx" ON "Product"("familyId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_familyId_fkey"
    FOREIGN KEY ("familyId") REFERENCES "ProductFamily"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
