-- The one market a buyer buys in (2026-09-23).
--
-- Additive and nullable. NULL means nobody has assigned this buyer a market
-- yet, and it fails CLOSED: such a buyer's shop is empty and says so, rather
-- than falling back to the whole catalogue. A product carrying no market is
-- likewise visible to nobody. Both halves of that rule live in
-- src/lib/shop-market.ts and are covered by its tests.
--
-- No default and no backfill, deliberately. Every buyer that exists today
-- reads NULL, so on deploy the shop is empty for all of them until ops sets
-- a market on each buyer AND on the products that buyer may order. That is
-- the intended behaviour, not an oversight: a default would hand somebody a
-- market they were never assigned, and a fallback to "see everything" is the
-- leak this feature exists to close.
--
-- The value is matched against Product.market exactly, and both are drawn
-- from CatalogLabel of kind MARKET. There is no foreign key, for the same
-- reason Product.market has none: the vocabulary is free-growing text and a
-- rename is an UPDATE across both tables (see renameLabel).
--
-- Written by hand rather than generated. `prisma migrate dev` would fold in
-- the PurchaseOrder_documentId_fkey drift carried since Phase 16, which is a
-- separate decision about what deleting a document does (see
-- context/current-feature.md, Phase 41's notes).
ALTER TABLE "Buyer" ADD COLUMN "market" TEXT;

-- The shop reads it on every catalogue request, once per page.
CREATE INDEX "Buyer_market_idx" ON "Buyer"("market");
