-- A land shipment can carry several trucks (2026-11-25). The truck already
-- typed on a land shipment becomes its first ShipmentTruck, then the columns
-- leave Shipment.
CREATE TABLE "ShipmentTruck" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "landCompany" TEXT,
    "landVehiclePlate" TEXT,
    "landDriverName" TEXT,
    "landDriverPhone" TEXT,
    "landDriverIc" TEXT,
    "landPallets" INTEGER,
    "landPickupOn" DATE,
    "landEtaOn" DATE,
    "landDeliveredOn" DATE,
    "landStatus" "LandStatus" NOT NULL DEFAULT 'PENDING',
    "landBorderCrossing" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShipmentTruck_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShipmentTruck_shipmentId_idx" ON "ShipmentTruck"("shipmentId");

ALTER TABLE "ShipmentTruck" ADD CONSTRAINT "ShipmentTruck_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Only a land shipment with something typed on its truck gets a row.
INSERT INTO "ShipmentTruck" ("id", "shipmentId", "landCompany", "landVehiclePlate", "landDriverName", "landDriverPhone", "landDriverIc", "landPallets", "landPickupOn", "landEtaOn", "landDeliveredOn", "landStatus", "landBorderCrossing", "createdAt", "updatedAt")
SELECT 'trk' || "id", "id", "landCompany", "landVehiclePlate", "landDriverName", "landDriverPhone", "landDriverIc", "landPallets", "landPickupOn", "landEtaOn", "landDeliveredOn", "landStatus", "landBorderCrossing", "createdAt", CURRENT_TIMESTAMP
FROM "Shipment"
WHERE "mode" = 'LAND'
  AND (COALESCE("landCompany", "landVehiclePlate", "landDriverName", "landDriverPhone", "landDriverIc", "landBorderCrossing") IS NOT NULL
       OR "landPallets" IS NOT NULL OR "landPickupOn" IS NOT NULL OR "landEtaOn" IS NOT NULL OR "landDeliveredOn" IS NOT NULL
       OR "landStatus" <> 'PENDING');

ALTER TABLE "Shipment"
    DROP COLUMN "landCompany",
    DROP COLUMN "landVehiclePlate",
    DROP COLUMN "landDriverName",
    DROP COLUMN "landDriverPhone",
    DROP COLUMN "landDriverIc",
    DROP COLUMN "landPallets",
    DROP COLUMN "landPickupOn",
    DROP COLUMN "landEtaOn",
    DROP COLUMN "landDeliveredOn",
    DROP COLUMN "landStatus",
    DROP COLUMN "landBorderCrossing";
