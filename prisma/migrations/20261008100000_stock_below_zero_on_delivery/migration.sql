-- An order going out for delivery for more than was counted still goes, and
-- takes stock below zero (2026-10-08): the negative figure is the shortfall.
-- A count somebody typed is still never negative. Keyed on `fromCartons`, not
-- `purchaseOrderId`, because deleting the order nulls that link and the row
-- must stay valid.
ALTER TABLE "StockCount" DROP CONSTRAINT "StockCount_cartons_not_negative";
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_cartons_not_negative"
    CHECK ("cartons" >= 0 OR "fromCartons" IS NOT NULL);
