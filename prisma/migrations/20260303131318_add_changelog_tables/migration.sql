-- CreateEnum
CREATE TYPE "ChangelogCategory" AS ENUM ('FEATURE', 'BUGFIX', 'IMPROVEMENT', 'OTHER');

-- CreateTable
CREATE TABLE "ChangelogProject" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "iconUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ChangelogProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangelogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" "ChangelogCategory" NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChangelogProject_slug_key" ON "ChangelogProject"("slug");

-- CreateIndex
CREATE INDEX "idx_changelog_version_sort" ON "ChangelogVersion"("projectId", "sortOrder" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_changelog_version_project_version" ON "ChangelogVersion"("projectId", "version");

-- CreateIndex
CREATE INDEX "idx_changelog_entry_category" ON "ChangelogEntry"("category");

-- CreateIndex
CREATE UNIQUE INDEX "uq_changelog_entry_version_order" ON "ChangelogEntry"("versionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "ChangelogVersion" ADD CONSTRAINT "ChangelogVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ChangelogProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangelogEntry" ADD CONSTRAINT "ChangelogEntry_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ChangelogVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
