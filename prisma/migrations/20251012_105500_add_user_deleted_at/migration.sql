-- AlterTable
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "idx_user_deleted_at" ON "User"("deletedAt");
