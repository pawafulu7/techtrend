-- CreateEnum
CREATE TYPE "InquiryCategory" AS ENUM ('FEATURE_REQUEST', 'BUG_REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "Inquiry" (
    "id" TEXT NOT NULL,
    "category" "InquiryCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "contactEmail" VARCHAR(254),
    "userId" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Inquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_inquiry_status_created" ON "Inquiry"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_inquiry_created" ON "Inquiry"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_inquiry_user" ON "Inquiry"("userId");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

