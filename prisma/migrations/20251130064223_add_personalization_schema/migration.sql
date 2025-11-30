-- CreateTable
CREATE TABLE "InterestCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "centroidEmbedding" vector(1536),
    "centroidComputedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "InterestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagCategoryMapping" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCategoryPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "UserCategoryPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterestCategory_slug_key" ON "InterestCategory"("slug");

-- CreateIndex
CREATE INDEX "idx_interest_category_slug" ON "InterestCategory"("slug");

-- CreateIndex
CREATE INDEX "idx_interest_category_sort_order" ON "InterestCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "idx_interest_category_is_active" ON "InterestCategory"("isActive");

-- CreateIndex
CREATE INDEX "idx_tag_category_mapping_tag" ON "TagCategoryMapping"("tagId");

-- CreateIndex
CREATE INDEX "idx_tag_category_mapping_category" ON "TagCategoryMapping"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tag_category_mapping" ON "TagCategoryMapping"("tagId", "categoryId");

-- CreateIndex
CREATE INDEX "idx_user_category_preference_user" ON "UserCategoryPreference"("userId");

-- CreateIndex
CREATE INDEX "idx_user_category_preference_category" ON "UserCategoryPreference"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "uq_user_category_preference" ON "UserCategoryPreference"("userId", "categoryId");

-- AddForeignKey
ALTER TABLE "TagCategoryMapping" ADD CONSTRAINT "TagCategoryMapping_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagCategoryMapping" ADD CONSTRAINT "TagCategoryMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InterestCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryPreference" ADD CONSTRAINT "UserCategoryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryPreference" ADD CONSTRAINT "UserCategoryPreference_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InterestCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
