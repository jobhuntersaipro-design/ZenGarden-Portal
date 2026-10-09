-- A booking confirmation may name the purchase order it ships. Additive and
-- nullable; deleting the order clears the link and keeps the booking.
ALTER TABLE "BookingConfirmation" ADD COLUMN "purchaseOrderId" TEXT;

CREATE INDEX "BookingConfirmation_purchaseOrderId_idx" ON "BookingConfirmation"("purchaseOrderId");

ALTER TABLE "BookingConfirmation" ADD CONSTRAINT "BookingConfirmation_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
