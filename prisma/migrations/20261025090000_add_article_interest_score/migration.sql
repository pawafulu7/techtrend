-- 記事の興味の分野の点数を前もって計算して持つ（lib/personalization/interest-scores.ts）。
-- ホームの「興味の分野で絞り込む」とダイジェストの「あなたへのおすすめ」は、リクエストのたびに
-- 重心との kNN を引く代わりに、この表を引く
-- CreateTable
CREATE TABLE "ArticleInterestScore" (
    "articleId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "embeddingId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ArticleInterestScore_pkey" PRIMARY KEY ("articleId","categoryId")
);

-- CreateIndex
CREATE INDEX "idx_article_interest_score_category" ON "ArticleInterestScore"("categoryId");

-- CreateIndex
CREATE INDEX "idx_article_interest_score_embedding" ON "ArticleInterestScore"("embeddingId");

-- AddForeignKey
ALTER TABLE "ArticleInterestScore" ADD CONSTRAINT "ArticleInterestScore_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleInterestScore" ADD CONSTRAINT "ArticleInterestScore_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "InterestCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleInterestScore" ADD CONSTRAINT "ArticleInterestScore_embeddingId_fkey" FOREIGN KEY ("embeddingId") REFERENCES "ArticleEmbedding"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 分野の重心を「分野の記事（分野に対応付けたタグを持つ記事）の平均 − 全記事の平均」で作り直す。
-- 週 1 回の scripts/scheduled/refresh-personalization.ts（lib/personalization/centroid-service.ts）と同じ計算。
-- 分野の記事の平均どうしは cos が 0.79〜0.96 と近く、分野の区別がほとんど付かなかった（全記事の平均を引くと最大 0.71）。
-- 記事の無い有効な分野は重心を消す（前の作り方の重心が残ると、その分野にほぼ全記事が入るため）
WITH category_articles AS (
  SELECT DISTINCT ON (tcm."categoryId", ae."articleId")
    tcm."categoryId" AS category_id,
    ae.embedding
  FROM "TagCategoryMapping" tcm
  INNER JOIN "_ArticleToTag" at ON at."B" = tcm."tagId"
  INNER JOIN "ArticleEmbedding" ae ON ae."articleId" = at."A"
  WHERE ae."embeddingKey" = 'summary'
    AND ae.model = 'text-embedding-3-small'
    AND ae.version = 1
),
all_articles AS (
  SELECT AVG(embedding) AS mean
  FROM "ArticleEmbedding"
  WHERE "embeddingKey" = 'summary'
    AND model = 'text-embedding-3-small'
    AND version = 1
),
centroids AS (
  SELECT category_id, AVG(embedding) - (SELECT mean FROM all_articles) AS centroid
  FROM category_articles
  GROUP BY category_id
)
UPDATE "InterestCategory" AS c
SET "centroidEmbedding" = centroids.centroid,
    "centroidComputedAt" = CASE WHEN centroids.centroid IS NULL THEN NULL ELSE NOW() END,
    "updatedAt" = NOW()
FROM (
  SELECT ic.id, centroids.centroid
  FROM "InterestCategory" ic
  LEFT JOIN centroids ON centroids.category_id = ic.id
  WHERE ic."isActive" = true
) AS centroids
WHERE c.id = centroids.id;

-- 今ある記事の点数を書く。しきい値 0.3 は INTEREST_SCORE_THRESHOLD と同じ。重心がゼロのベクトルだと
-- cos が NaN になり、NaN はどの数より大きく並んでしきい値を通るので除く。
-- 表を作った後にデプロイ前の埋め込みのワーカーが同じ組を書いていても失敗しないよう、既にある組は飛ばす
INSERT INTO "ArticleInterestScore" ("articleId", "categoryId", "embeddingId", score)
SELECT "articleId", "categoryId", "embeddingId", score
FROM (
  SELECT
    e."articleId",
    c.id AS "categoryId",
    e.id AS "embeddingId",
    1 - (e.embedding <=> c."centroidEmbedding") AS score
  FROM "ArticleEmbedding" e
  CROSS JOIN "InterestCategory" c
  WHERE e."embeddingKey" = 'summary'
    AND e.model = 'text-embedding-3-small'
    AND e.version = 1
    AND c."isActive" = true
    AND c."centroidEmbedding" IS NOT NULL
) AS s
WHERE s.score >= 0.3
  AND s.score <> 'NaN'::float8
ON CONFLICT ("articleId", "categoryId") DO NOTHING;

-- まとめて入れた行の統計を、自動の ANALYZE を待たずに作る（デプロイ直後の計画の見積もりのため）
ANALYZE "ArticleInterestScore";
