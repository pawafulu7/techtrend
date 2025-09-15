-- Add authentication fields to User table if they don't exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT;

CREATE TABLE IF NOT EXISTS "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- Note: Unique constraints for VerificationToken were created in the baseline
-- migration (20250830000000_initial_baseline). We intentionally do not recreate
-- them here to avoid duplicate constraint errors when resetting/applying.
