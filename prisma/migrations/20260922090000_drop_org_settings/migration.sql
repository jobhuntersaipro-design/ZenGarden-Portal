-- We are the supplier. There was never a second company to describe, so the
-- whole record goes (2026-09-18, at the user's request): the purchase-order
-- document's Supplier block, the shop footer's Contact column, the /admin
-- Contact details card and the four ZEN_GARDEN_* fallbacks all read these
-- four columns and nothing else did.
--
-- Read before writing this: `OrgSettings` holds **0 rows on development and
-- 0 on production**, and no ZEN_GARDEN_* variable is set on production
-- either — so nothing displayed anywhere was coming from here.
DROP TABLE "OrgSettings";

-- `org.settings` left src/lib/permissions/actions.ts in the same commit.
-- `PermissionGrant.action` is a plain String with no foreign key, so these
-- five rows (one per role) would otherwise sit unread for ever.
DELETE FROM "PermissionGrant" WHERE "action" = 'org.settings';
