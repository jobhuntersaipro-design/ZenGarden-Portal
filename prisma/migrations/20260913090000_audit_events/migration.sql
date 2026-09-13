-- Admin › Customers: the audit trail (docs/specs/25-admin-customers.md §5).

-- One statement creates the type and the table's use of it. This is safe in a
-- single migration, unlike Phase 15's split: Postgres refuses a *newly added
-- value* on an existing enum in the transaction that added it, but a type
-- created here and referenced by a column here is fine — no value literal is
-- written until an application INSERT, long after this commits.
CREATE TYPE "AuditAction" AS ENUM (
    'CUSTOMER_CREATED',
    'CUSTOMER_UPDATED',
    'CUSTOMER_DELETED',
    'CONTACT_INVITED',
    'CONTACT_UPDATED',
    'CONTACT_REMOVED',
    'CONTACT_DISABLED',
    'CONTACT_RESTORED',
    'PASSWORD_RESET',
    'INVITE_RESENT',
    'SIGNED_IN'
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "buyerId" TEXT,
    "subjectUserId" TEXT,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_buyerId_at_idx" ON "AuditEvent"("buyerId", "at");
CREATE INDEX "AuditEvent_actorId_at_idx" ON "AuditEvent"("actorId", "at");

-- SET NULL on all three, never CASCADE: recording that a customer was deleted
-- is worthless if deleting the customer deletes the record of it.
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "Buyer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_subjectUserId_fkey"
    FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
