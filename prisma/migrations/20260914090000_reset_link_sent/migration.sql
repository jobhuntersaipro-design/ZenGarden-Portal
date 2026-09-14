-- Buyer management (docs/specs/26-buyer-management.md §2): a super admin can
-- put a password-reset link in a user's or a buyer contact's inbox, and the
-- timeline says so. Additive only — the existing CUSTOMER_* values keep their
-- names on purpose; renaming a Postgres enum buys nothing a reader sees.
ALTER TYPE "AuditAction" ADD VALUE 'RESET_LINK_SENT';
