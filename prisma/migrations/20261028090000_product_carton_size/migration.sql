-- The carton's size and packed weight as fields (2026-10-28). CBM is derived
-- from them on read, so it has no column.
ALTER TABLE "Product" ADD COLUMN "cartonLengthCm" DOUBLE PRECISION,
ADD COLUMN "cartonWidthCm" DOUBLE PRECISION,
ADD COLUMN "cartonHeightCm" DOUBLE PRECISION,
ADD COLUMN "grossWeightKg" DOUBLE PRECISION;

-- One-time cleanup: the free-text "Carton dimension: … Gross Weight: … CBM: …"
-- line leaves every description; the fields above are now the only source.
-- A description left empty becomes NULL. Flag "n" makes ^ and . line-bound.
UPDATE "Product"
SET "description" = NULLIF(
  btrim(
    regexp_replace(
      "description",
      '^[^\n]*(carton dimension|gross weight\s*:|cbm\s*:)[^\n]*(\n|$)',
      '',
      'gin'
    ),
    E' \n\r\t'
  ),
  ''
)
WHERE "description" ~* '(carton dimension|gross weight\s*:|cbm\s*:)';
