-- Phase 15. This migration adds the enum value and NOTHING else.
--
-- Prisma wraps each migration in a transaction, and Postgres refuses to
-- *reference* a newly added enum value in the transaction that added it. The
-- CHECK constraint in the next migration spells 'CLIENT', so combining the two
-- passes `migrate dev` against a database where the value already exists and
-- then fails `migrate deploy` in production, after the enum is committed.
ALTER TYPE "Role" ADD VALUE 'CLIENT';
