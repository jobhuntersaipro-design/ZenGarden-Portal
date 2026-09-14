-- The catalogue's vocabulary becomes a thing of its own
-- (docs/specs/28-catalogue-and-product-lifecycle.md §1).
--
-- Brand, variant, market and category were derived from the products that
-- carried them, so a value could not be created before a product used it, nor
-- renamed, nor removed. This table holds the vocabulary; `Product` keeps its
-- plain strings and takes no foreign key.

CREATE TYPE "CatalogLabelKind" AS ENUM ('BRAND', 'VARIANT', 'MARKET', 'CATEGORY');

CREATE TABLE "CatalogLabel" (
    "id" TEXT NOT NULL,
    "kind" "CatalogLabelKind" NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogLabel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogLabel_kind_value_key" ON "CatalogLabel"("kind", "value");
CREATE INDEX "CatalogLabel_kind_idx" ON "CatalogLabel"("kind");

-- Backfill: everything the catalogue already says, so the screen opens onto
-- the real vocabulary rather than an empty list. `gen_random_uuid()` is fine
-- for ids here — nothing joins on them, and every later row comes from the
-- application's own cuid.
INSERT INTO "CatalogLabel" ("id", "kind", "value")
SELECT gen_random_uuid()::text, 'BRAND', DISTINCT_VALUES.value
FROM (SELECT DISTINCT "brand" AS value FROM "Product" WHERE "brand" IS NOT NULL) AS DISTINCT_VALUES
ON CONFLICT DO NOTHING;

INSERT INTO "CatalogLabel" ("id", "kind", "value")
SELECT gen_random_uuid()::text, 'VARIANT', DISTINCT_VALUES.value
FROM (SELECT DISTINCT "variant" AS value FROM "Product" WHERE "variant" IS NOT NULL) AS DISTINCT_VALUES
ON CONFLICT DO NOTHING;

INSERT INTO "CatalogLabel" ("id", "kind", "value")
SELECT gen_random_uuid()::text, 'MARKET', DISTINCT_VALUES.value
FROM (SELECT DISTINCT "market" AS value FROM "Product" WHERE "market" IS NOT NULL) AS DISTINCT_VALUES
ON CONFLICT DO NOTHING;

INSERT INTO "CatalogLabel" ("id", "kind", "value")
SELECT gen_random_uuid()::text, 'CATEGORY', DISTINCT_VALUES.value
FROM (SELECT DISTINCT "category" AS value FROM "Product") AS DISTINCT_VALUES
ON CONFLICT DO NOTHING;

-- The nine seeded categories, including "Uncategorised", which the
-- purchase-order intake path writes verbatim when a document gives none. A
-- database with no product in one of them must still offer it.
INSERT INTO "CatalogLabel" ("id", "kind", "value")
SELECT gen_random_uuid()::text, 'CATEGORY', seeded.value
FROM (VALUES
  ('Shower cream & gel'),
  ('Hand wash & soap'),
  ('Hair care'),
  ('Body care'),
  ('Hand sanitizer'),
  ('Dishwash & cleanser'),
  ('Laundry detergent'),
  ('Fragrance'),
  ('Uncategorised')
) AS seeded(value)
ON CONFLICT DO NOTHING;
