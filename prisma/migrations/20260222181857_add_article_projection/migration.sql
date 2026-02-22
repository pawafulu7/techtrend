-- CreateTable
CREATE TABLE "ArticleProjection" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "x2d" DOUBLE PRECISION NOT NULL,
    "y2d" DOUBLE PRECISION NOT NULL,
    "x3d" DOUBLE PRECISION NOT NULL,
    "y3d" DOUBLE PRECISION NOT NULL,
    "z3d" DOUBLE PRECISION NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "computedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleProjection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleProjection_articleId_key" ON "ArticleProjection"("articleId");

-- CreateIndex
CREATE INDEX "ArticleProjection_clusterId_idx" ON "ArticleProjection"("clusterId");

-- AddForeignKey
ALTER TABLE "ArticleProjection" ADD CONSTRAINT "ArticleProjection_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
