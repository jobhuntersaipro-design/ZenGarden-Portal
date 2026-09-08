-- Renamed, not dropped and re-added as Prisma proposed: the column was named
-- for a country of origin and turned out to hold the market a formulation is
-- made for (a country or a customer), and a rename keeps whatever it holds.
ALTER TABLE "Product" RENAME COLUMN "country" TO "market";
