-- CreateEnum
CREATE TYPE "ArticleCategory" AS ENUM ('frontend', 'backend', 'ai_ml', 'security', 'devops', 'database', 'mobile', 'web3', 'design', 'testing', 'performance', 'architecture');

-- AlterTable: First convert existing data from hyphen to underscore
UPDATE "Article" SET "category" = 'ai_ml' WHERE "category" = 'ai-ml';

-- AlterTable: Change column type to use enum
ALTER TABLE "Article" ALTER COLUMN "category" TYPE "ArticleCategory" USING "category"::"ArticleCategory";