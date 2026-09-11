-- Organisation settings (docs/specs/24-org-settings.md §1).

CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "supplierName" TEXT,
    "supplierEmail" TEXT,
    "supplierPhone" TEXT,
    "supplierAddress" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- The singleton is enforced in SQL, not by convention: a second row appearing
-- and the app silently reading whichever came back first is exactly the failure
-- a comment does not prevent.
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_singleton" CHECK ("id" = 'singleton');

-- SetNull, never Cascade: the organisation's configuration must survive
-- whoever last touched it.
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
