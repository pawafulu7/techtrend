-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "SourceGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SourceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SourceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceTagAssignment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceGroup_name_key" ON "SourceGroup"("name");

-- CreateIndex
CREATE INDEX "idx_source_group_type" ON "SourceGroup"("type");

-- CreateIndex
CREATE INDEX "idx_source_group_ordering" ON "SourceGroup"("ordering");

-- CreateIndex
CREATE UNIQUE INDEX "SourceTag_name_key" ON "SourceTag"("name");

-- CreateIndex
CREATE INDEX "idx_source_tag_category" ON "SourceTag"("category");

-- CreateIndex
CREATE INDEX "idx_source_tag_assignment_source" ON "SourceTagAssignment"("sourceId");

-- CreateIndex
CREATE INDEX "idx_source_tag_assignment_tag" ON "SourceTagAssignment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_source_tag_assignment" ON "SourceTagAssignment"("sourceId", "tagId");

-- CreateIndex
CREATE INDEX "idx_source_group_id" ON "Source"("groupId");

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SourceGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceTagAssignment" ADD CONSTRAINT "SourceTagAssignment_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceTagAssignment" ADD CONSTRAINT "SourceTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "SourceTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
