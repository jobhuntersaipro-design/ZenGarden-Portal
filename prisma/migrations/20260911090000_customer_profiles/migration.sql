-- Customer profiles (docs/specs/23-customer-profiles.md §1).
-- One file, unlike Phase 15's pair: no enum value is added here, so nothing is
-- referenced in the transaction that created it.

ALTER TABLE "Buyer" ADD COLUMN "remark" TEXT;

ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- Nullable and unique: Postgres allows any number of NULLs under a unique
-- index, so every existing ops user keeps a null and no backfill is needed.
-- `username` is stored lower-cased by usernameSchema, which is what makes a
-- plain (not case-insensitive) index sufficient.
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
