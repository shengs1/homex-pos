-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountAmount" DECIMAL(12,2),
ADD COLUMN     "promotionCode" TEXT;

-- AlterTable
ALTER TABLE "promotions" ADD COLUMN     "customerLimit" INTEGER,
ADD COLUMN     "eligibleTiers" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "maxDiscountAmount" DECIMAL(12,2),
ADD COLUMN     "name" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
