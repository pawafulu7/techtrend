-- AlterTable: Article のタイムスタンプを JST から UTC (timestamptz(6)) へ変換
ALTER TABLE "Article"
  ALTER COLUMN "publishedAt" TYPE TIMESTAMPTZ(6) USING "publishedAt" AT TIME ZONE 'Asia/Tokyo',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(6) USING "createdAt" AT TIME ZONE 'Asia/Tokyo',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(6) USING "updatedAt" AT TIME ZONE 'Asia/Tokyo',
  ALTER COLUMN "contentUpdatedAt" TYPE TIMESTAMPTZ(6) USING "contentUpdatedAt" AT TIME ZONE 'Asia/Tokyo',
  ALTER COLUMN "qualityScoreComputedAt" TYPE TIMESTAMPTZ(6) USING "qualityScoreComputedAt" AT TIME ZONE 'Asia/Tokyo',
  ALTER COLUMN "summaryComputedAt" TYPE TIMESTAMPTZ(6) USING "summaryComputedAt" AT TIME ZONE 'Asia/Tokyo';
