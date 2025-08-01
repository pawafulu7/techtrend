-- CreateIndex
CREATE INDEX "idx_article_publishedAt" ON "Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_article_sourceId" ON "Article"("sourceId");

-- CreateIndex
CREATE INDEX "idx_article_qualityScore" ON "Article"("qualityScore" DESC);

-- CreateIndex
CREATE INDEX "idx_article_bookmarks" ON "Article"("bookmarks" DESC);