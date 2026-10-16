-- Phase 66: a note left on a purchase order on its own, not with a stage move.
ALTER TYPE "PoEventKind" ADD VALUE 'NOTE';

-- `roleCan` reads stored grants only, so the new key needs its rows.
INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
  ('SUPER_ADMIN', 'po.note', true, NOW()),
  ('PRODUCTION_PLANNER', 'po.note', true, NOW()),
  ('QC', 'po.note', true, NOW()),
  ('WAREHOUSE', 'po.note', true, NOW()),
  ('MEMBER', 'po.note', true, NOW())
ON CONFLICT ("role", "action") DO NOTHING;
