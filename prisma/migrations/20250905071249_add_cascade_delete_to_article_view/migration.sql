-- AlterTable
ALTER TABLE "ArticleView" DROP CONSTRAINT "ArticleView_articleId_fkey";
ALTER TABLE "ArticleView" DROP CONSTRAINT "ArticleView_userId_fkey";

-- AddForeignKey
ALTER TABLE "ArticleView" ADD CONSTRAINT "ArticleView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleView" ADD CONSTRAINT "ArticleView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;