-- Phase 48. Split from the defaults migration because Postgres refuses to
-- reference a newly added enum value in the transaction that added it — the
-- same rule that forced two migrations in Phase 15.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRODUCTION_PLANNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'QC';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'WAREHOUSE';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PERMISSIONS_CHANGED';

CREATE TABLE "PermissionGrant" (
    "role" "Role" NOT NULL,
    "action" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("role", "action")
);

ALTER TABLE "PermissionGrant"
  ADD CONSTRAINT "PermissionGrant_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
