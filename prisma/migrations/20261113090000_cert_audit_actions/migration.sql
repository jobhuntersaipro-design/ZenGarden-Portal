-- Certificate history (ClickUp z8v9xnhuf8 points 4 and 5): an expiry edit
-- and each override set or removed are kept as audit rows.
ALTER TYPE "AuditAction" ADD VALUE 'CERT_EXPIRY_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'CERT_OVERRIDE_SET';
ALTER TYPE "AuditAction" ADD VALUE 'CERT_OVERRIDE_CLEARED';
