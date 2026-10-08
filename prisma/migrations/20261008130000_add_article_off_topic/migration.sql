-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "isOffTopic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offTopicCheckedAt" TIMESTAMPTZ(6);
