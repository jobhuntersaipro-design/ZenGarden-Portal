-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "avatarSeed" TEXT,
ADD COLUMN     "avatarStyle" TEXT,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);
