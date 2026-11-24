-- Land delivery: a shipment is by sea or by land. Additive; every existing
-- shipment stays SEA.
CREATE TYPE "ShipmentMode" AS ENUM ('SEA', 'LAND');

ALTER TYPE "ShipmentDocType" ADD VALUE 'DELIVERY_ORDER';

ALTER TABLE "Shipment"
  ADD COLUMN "mode" "ShipmentMode" NOT NULL DEFAULT 'SEA',
  ADD COLUMN "landCompany" TEXT,
  ADD COLUMN "landVehiclePlate" TEXT,
  ADD COLUMN "landDriverName" TEXT,
  ADD COLUMN "landDriverPhone" TEXT,
  ADD COLUMN "landPickupOn" DATE,
  ADD COLUMN "landEtaOn" DATE,
  ADD COLUMN "landDeliveredOn" DATE,
  ADD COLUMN "landBorderCrossing" TEXT;
