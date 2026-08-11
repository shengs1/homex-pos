-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "enableBarcodeScanner" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");
