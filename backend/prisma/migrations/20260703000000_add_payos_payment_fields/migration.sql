ALTER TABLE "Payment"
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "providerOrderCode" INTEGER,
ADD COLUMN "providerPaymentLinkId" TEXT,
ADD COLUMN "checkoutUrl" TEXT,
ADD COLUMN "qrCode" TEXT,
ADD COLUMN "paymentCode" TEXT,
ADD COLUMN "providerTransactionId" TEXT,
ADD COLUMN "rawWebhookPayload" JSONB;

CREATE UNIQUE INDEX "Payment_providerOrderCode_key" ON "Payment"("providerOrderCode");

CREATE TABLE "PaymentWebhookLog" (
  "id" SERIAL NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT,
  "paymentId" INTEGER,
  "orderCode" INTEGER,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PaymentWebhookLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentWebhookLog"
ADD CONSTRAINT "PaymentWebhookLog_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Setting" ADD COLUMN "enablePayOSPayment" BOOLEAN NOT NULL DEFAULT false;
