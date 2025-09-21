-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."ArticleCategory" AS ENUM ('frontend', 'backend', 'ai_ml', 'security', 'devops', 'database', 'mobile', 'web3', 'design', 'testing', 'performance', 'architecture');

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "summary" TEXT,
    "thumbnail" TEXT,
    "content" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "userVotes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "difficulty" TEXT,
    "detailedSummary" TEXT,
    "articleType" TEXT,
    "summaryVersion" INTEGER NOT NULL DEFAULT 7,
    "category" "public"."ArticleCategory",

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArticleView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ArticleView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" VARCHAR(50) DEFAULT 'user',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."WeeklyDigest" (
    "id" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "articleCount" INTEGER NOT NULL,
    "topArticles" JSONB NOT NULL,
    "categories" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_ArticleToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArticleToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider" ASC, "providerAccountId" ASC);

-- CreateIndex
CREATE INDEX "Article_bookmarks_idx" ON "public"."Article"("bookmarks" DESC);

-- CreateIndex
CREATE INDEX "Article_createdAt_idx" ON "public"."Article"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Article_publishedAt_idx" ON "public"."Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Article_qualityScore_idx" ON "public"."Article"("qualityScore" DESC);

-- CreateIndex
CREATE INDEX "Article_sourceId_idx" ON "public"."Article"("sourceId" ASC);

-- CreateIndex
CREATE INDEX "Article_sourceId_publishedAt_idx" ON "public"."Article"("sourceId" ASC, "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Article_url_key" ON "public"."Article"("url" ASC);

-- CreateIndex
CREATE INDEX "idx_article_created_at" ON "public"."Article"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_article_published_at" ON "public"."Article"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_article_quality_score" ON "public"."Article"("qualityScore" DESC);

-- CreateIndex
CREATE INDEX "idx_article_source_id" ON "public"."Article"("sourceId" ASC);

-- CreateIndex
CREATE INDEX "idx_article_source_published" ON "public"."Article"("sourceId" ASC, "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ArticleView_articleId_idx" ON "public"."ArticleView"("articleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ArticleView_userId_articleId_key" ON "public"."ArticleView"("userId" ASC, "articleId" ASC);

-- CreateIndex
CREATE INDEX "ArticleView_userId_isRead_idx" ON "public"."ArticleView"("userId" ASC, "isRead" ASC);

-- CreateIndex
CREATE INDEX "ArticleView_userId_viewedAt_idx" ON "public"."ArticleView"("userId" ASC, "viewedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_articleId_key" ON "public"."Favorite"("userId" ASC, "articleId" ASC);

-- CreateIndex
CREATE INDEX "idx_favorite_user_article" ON "public"."Favorite"("userId" ASC, "articleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Source_name_key" ON "public"."Source"("name" ASC);

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "public"."Tag"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "public"."Tag"("name" ASC);

-- CreateIndex
CREATE INDEX "idx_tag_name" ON "public"."Tag"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier" ASC, "token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDigest_weekStartDate_key" ON "public"."WeeklyDigest"("weekStartDate" ASC);

-- CreateIndex
CREATE INDEX "_ArticleToTag_B_index" ON "public"."_ArticleToTag"("B" ASC);

-- CreateIndex
CREATE INDEX "idx_article_tag_join" ON "public"."_ArticleToTag"("A" ASC, "B" ASC);

-- CreateIndex
CREATE INDEX "idx_article_tag_reverse" ON "public"."_ArticleToTag"("B" ASC, "A" ASC);

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleView" ADD CONSTRAINT "ArticleView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArticleView" ADD CONSTRAINT "ArticleView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Favorite" ADD CONSTRAINT "Favorite_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ArticleToTag" ADD CONSTRAINT "_ArticleToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ArticleToTag" ADD CONSTRAINT "_ArticleToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

