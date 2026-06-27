-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WarrantyStatus" ADD VALUE 'CLAIMED';
ALTER TYPE "WarrantyStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "WarrantyStatus" ADD VALUE 'REJECTED';

-- DropForeignKey
ALTER TABLE "Warranty" DROP CONSTRAINT "Warranty_customerId_fkey";

-- AlterTable
ALTER TABLE "Warranty" ADD COLUMN     "note" TEXT,
ALTER COLUMN "customerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
