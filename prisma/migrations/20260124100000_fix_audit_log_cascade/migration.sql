-- AlterTable: Change SocialPostAuditLog.socialPostId to nullable and update cascade to SetNull
-- This preserves audit logs when the parent SocialPost is deleted

-- Drop the existing foreign key constraint
ALTER TABLE "SocialPostAuditLog" DROP CONSTRAINT IF EXISTS "SocialPostAuditLog_socialPostId_fkey";

-- Make socialPostId nullable
ALTER TABLE "SocialPostAuditLog" ALTER COLUMN "socialPostId" DROP NOT NULL;

-- Add the foreign key constraint with SetNull behavior
ALTER TABLE "SocialPostAuditLog" ADD CONSTRAINT "SocialPostAuditLog_socialPostId_fkey"
  FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add default value to updatedAt for direct SQL inserts
ALTER TABLE "SocialPost" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
