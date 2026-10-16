-- Phase 67: QC hold, between In production and QC passed.
ALTER TYPE "PoStage" ADD VALUE 'QC_HOLD' BEFORE 'QC_PASSED';

-- Releasing a hold is QC's call. `roleCan` reads stored grants only.
INSERT INTO "PermissionGrant" ("role", "action", "granted", "updatedAt") VALUES
  ('SUPER_ADMIN', 'po.advance.qc_hold', true, NOW()),
  ('PRODUCTION_PLANNER', 'po.advance.qc_hold', false, NOW()),
  ('QC', 'po.advance.qc_hold', true, NOW()),
  ('WAREHOUSE', 'po.advance.qc_hold', false, NOW()),
  ('MEMBER', 'po.advance.qc_hold', false, NOW())
ON CONFLICT ("role", "action") DO NOTHING;
