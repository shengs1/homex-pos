-- Add employee login metadata without touching existing accounts.
ALTER TABLE "User" ADD COLUMN "employeeCode" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
