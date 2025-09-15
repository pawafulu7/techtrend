-- Add authentication fields to User table if they don't exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT;

-- Drop existing VerificationToken table if it exists (for clean migration reset)
-- This is safe because Prisma migrate reset is meant to recreate the database from scratch
DROP TABLE IF EXISTS "VerificationToken" CASCADE;

-- Create VerificationToken table
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- Add unique constraints
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_token_key" UNIQUE ("token");
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE ("identifier", "token");