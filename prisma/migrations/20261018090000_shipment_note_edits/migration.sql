-- A note can be edited (2026-10-18): when it last was.
ALTER TABLE "ShipmentEvent" ADD COLUMN "editedAt" TIMESTAMP(3);

-- The note typed on the create form becomes the shipment's first NOTE row, so it
-- can be edited and deleted like any other. The column stays, emptied.
INSERT INTO "ShipmentEvent" ("id", "shipmentId", "actorId", "actorName", "action", "text", "at")
SELECT 'note_' || s."id", s."id", s."createdById", COALESCE(u."name", 'Someone'), 'NOTE', s."note", s."createdAt"
FROM "Shipment" s
LEFT JOIN "User" u ON u."id" = s."createdById"
WHERE s."note" IS NOT NULL AND btrim(s."note") <> '';

UPDATE "Shipment" SET "note" = NULL WHERE "note" IS NOT NULL;
