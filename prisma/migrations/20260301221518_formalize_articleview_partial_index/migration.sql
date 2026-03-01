-- ArticleView: NOT EXISTS subquery optimization for digest queries
-- Covers: getPersonalizedArticles, getMustReadArticles, getMissedArticles (digest-service.ts)
-- Also benefits: read-status API (app/api/articles/read-status/route.ts)
-- Original: PR #67 (706163be), lost during baseline consolidation in PR #70 (ab66f085)
-- This migration formalizes the orphaned index under Prisma management.
CREATE INDEX IF NOT EXISTS "idx_article_view_user_article_read"
ON "ArticleView" ("userId", "articleId", "isRead")
WHERE ("isRead" = true);
