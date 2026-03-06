-- AlterTable
ALTER TABLE "UserDeletionLog" ADD COLUMN "deletedBy" TEXT NOT NULL DEFAULT 'self';
ALTER TABLE "UserDeletionLog" ADD COLUMN "adminUserId" TEXT;
