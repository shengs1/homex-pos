-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "smtpHost" TEXT,
ADD COLUMN     "smtpPassword" TEXT,
ADD COLUMN     "smtpPort" INTEGER DEFAULT 587,
ADD COLUMN     "smtpUser" TEXT,
ADD COLUMN     "vatEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
