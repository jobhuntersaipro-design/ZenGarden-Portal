-- How many cartons go on a pallet, which the customer's own product labels
-- print ("60CTNS/PALLET") and their inventory sheet carries in every block.
-- The catalogue importer has been parsing that note out and discarding it
-- since Phase 13; it has somewhere to go now.
--
-- Nullable: the figure is a packing fact, and plenty of rows will not have one
-- until somebody types it or the backfill finds it.
ALTER TABLE "Product" ADD COLUMN "cartonsPerPallet" INTEGER;
