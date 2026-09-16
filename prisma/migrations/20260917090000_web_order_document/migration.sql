-- A shop order carries the purchase order we generated for it
-- (docs/specs/37-purchase-order-pdf.md §2).
--
-- Additive and nullable: an order placed before this migration has no file,
-- and `attachWebOrderDocument` writes one the next time it is asked for.
--
-- ON DELETE SET NULL, not CASCADE: deleting the file must never delete the
-- order it describes.

ALTER TABLE "WebOrder" ADD COLUMN "documentId" TEXT;

CREATE UNIQUE INDEX "WebOrder_documentId_key" ON "WebOrder"("documentId");

ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
