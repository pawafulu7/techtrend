-- CreateTable
CREATE TABLE "UserDeletionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT,
    "authMethod" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "deletedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_user_deletion_log_deleted_at" ON "UserDeletionLog"("deletedAt");

-- CreateIndex
CREATE INDEX "idx_user_deletion_log_email" ON "UserDeletionLog"("email");
