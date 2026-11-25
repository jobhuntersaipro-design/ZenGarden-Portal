-- A land shipment's status (2026-11-25). Existing rows keep their meaning:
-- a delivered date reads Delivered, a truck count with no date reads Delivering.
CREATE TYPE "LandStatus" AS ENUM ('PENDING', 'DELIVERING', 'DELIVERED');

ALTER TABLE "Shipment" ADD COLUMN "landStatus" "LandStatus" NOT NULL DEFAULT 'PENDING';

UPDATE "Shipment" SET "landStatus" = 'DELIVERED' WHERE "landDeliveredOn" IS NOT NULL;
UPDATE "Shipment" SET "landStatus" = 'DELIVERING' WHERE "landDeliveredOn" IS NULL AND "landPallets" IS NOT NULL;
