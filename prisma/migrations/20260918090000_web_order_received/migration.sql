-- AlterEnum
-- BEFORE 'CONFIRMED' keeps the enum's sort order matching its lifecycle, which
-- matters to any ORDER BY on the column.
ALTER TYPE "WebOrderStatus" ADD VALUE 'RECEIVED' BEFORE 'CONFIRMED';

-- AlterTable
ALTER TABLE "WebOrder" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT;

-- AddForeignKey
ALTER TABLE "WebOrder" ADD CONSTRAINT "WebOrder_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
