-- Better Auth migration: Auth.js → Better Auth v1.6.2
-- Auth-related tables only (Account, User, VerificationToken → Verification, Session)
-- Note: Auth data is discarded (single user, re-registration planned)

-- Clear existing auth data before schema changes
DELETE FROM "Account";

-- DropIndex (old Account unique constraint)
DROP INDEX "Account_provider_providerAccountId_key";

-- AlterTable: Account → Better Auth schema
ALTER TABLE "Account" DROP COLUMN "access_token",
DROP COLUMN "expires_at",
DROP COLUMN "id_token",
DROP COLUMN "provider",
DROP COLUMN "providerAccountId",
DROP COLUMN "refresh_token",
DROP COLUMN "session_state",
DROP COLUMN "token_type",
DROP COLUMN "type",
ADD COLUMN     "accessToken" TEXT,
ADD COLUMN     "accessTokenExpiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "accountId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "idToken" TEXT,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "providerId" TEXT NOT NULL,
ADD COLUMN     "refreshToken" TEXT,
ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMPTZ(6),
ADD COLUMN     "updatedAt" TIMESTAMPTZ(6) NOT NULL;

-- AlterTable: User → remove password, add admin plugin fields, convert emailVerified
ALTER TABLE "User" DROP COLUMN "password",
ADD COLUMN     "banExpires" TIMESTAMPTZ(6),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false,
DROP COLUMN "emailVerified",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false;

-- DropTable: VerificationToken (replaced by Verification)
DROP TABLE "VerificationToken";

-- CreateTable: Session (Better Auth DB sessions)
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Verification (replaces VerificationToken)
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "idx_session_user_id" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "idx_session_token" ON "Session"("token");

-- CreateIndex
CREATE INDEX "idx_verification_identifier" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "idx_account_user_id" ON "Account"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
