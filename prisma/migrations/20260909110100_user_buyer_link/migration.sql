-- Phase 15. A client is a buyer's own contact, linked to exactly one Buyer.
ALTER TABLE "User" ADD COLUMN "buyerId" TEXT;

CREATE INDEX "User_buyerId_idx" ON "User"("buyerId");

ALTER TABLE "User"
  ADD CONSTRAINT "User_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma cannot express this, and it is the invariant the whole design rests
-- on. Marking clients by buyerId alone would fail *open*: `role` defaults to
-- MEMBER, so a client row that lost its buyer would silently become an ops
-- member with unscoped access to every buyer's orders. This fails closed.
ALTER TABLE "User"
  ADD CONSTRAINT "User_client_has_buyer"
  CHECK ("role" <> 'CLIENT' OR "buyerId" IS NOT NULL);
