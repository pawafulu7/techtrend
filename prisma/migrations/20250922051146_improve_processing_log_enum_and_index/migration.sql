/*
  Warnings:

  - The `status` column on the `ProcessingLog` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "public"."ProcessingStatus" AS ENUM ('success', 'failed', 'partial');

-- DropIndex
DROP INDEX "public"."idx_processing_log_name";

-- AlterTable
ALTER TABLE "public"."ProcessingLog" DROP COLUMN "status",
ADD COLUMN     "status" "public"."ProcessingStatus" NOT NULL DEFAULT 'success';
