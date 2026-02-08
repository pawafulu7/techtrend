-- CreateTable
CREATE TABLE "UserSourcePreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "sourceIds" TEXT[] NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "UserSourcePreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (user lookup)
CREATE INDEX "idx_user_source_preset_user" ON "UserSourcePreset"("userId");

-- CreateIndex (case-insensitive unique name per user)
-- Note: Prisma @@unique generates a standard index, but we need lower() for case-insensitive uniqueness.
-- The Prisma-level @@unique([userId, name]) serves as documentation; the real enforcement is this index.
CREATE UNIQUE INDEX "uq_user_source_preset_name" ON "UserSourcePreset"("userId", lower("name"));

-- AddForeignKey
ALTER TABLE "UserSourcePreset"
    ADD CONSTRAINT "UserSourcePreset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
