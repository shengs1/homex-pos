-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lastPurchaseAt" TIMESTAMP(3),
ADD COLUMN     "tierExpiresAt" TIMESTAMP(3),
ADD COLUMN     "tierUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderDetail" ADD COLUMN     "unitCost" DECIMAL(12,2);
