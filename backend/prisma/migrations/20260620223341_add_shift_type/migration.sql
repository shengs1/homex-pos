-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('MORNING', 'EVENING');

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "shiftType" "ShiftType" NOT NULL DEFAULT 'MORNING';
