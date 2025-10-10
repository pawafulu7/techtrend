import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();

async function enrichShortArticles() {
  console.log('短いコンテンツの記事をエンリッチメント処理します...');

  const enricherFactory = new ContentEnricherFactory();

  const shortArticles = await prisma.$queryRaw<Array<{
    id: string;
    title: string;
    url: string;
    content: string | null;
    sourceId: string;
  }>>`
    SELECT id, title, url, content, "sourceId"
    FROM "Article"
    WHERE (content IS NULL OR LENGTH(content) < 200)
      AND "sourceId" IN (
        'cyberagent_tech_blog', 'lycorp_tech_blog', 'dena_tech_blog',
        'smarthr_tech_blog', 'freee_tech_blog', 'mercari_tech_blog',
        'zozo_tech_blog', 'moneyforward_tech_blog', 'cookpad_tech_blog',
        'pepabo_tech_blog', 'sansan_tech_blog', 'gmo_tech_blog',
        'hatena_tech_blog'
      )
      AND "publishedAt" >= '2025-09-01'
    ORDER BY "publishedAt" DESC
  `;

  console.log(`対象記事数: ${shortArticles.length}件`);

  let successCount = 0;
  let failCount = 0;

  for (const article of shortArticles) {
    try {
      const enricher = enricherFactory.getEnricher(article.url);
      if (!enricher) {
        console.log(`No enricher: ${article.title.substring(0, 40)}`);
        failCount++;
        continue;
      }

      console.log(`Processing: ${article.title.substring(0, 40)}...`);
      const enrichedData = await enricher.enrich(article.url);

      if (enrichedData && enrichedData.content && enrichedData.content.length > (article.content?.length || 0)) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            content: enrichedData.content,
            contentUpdatedAt: new Date(),
            ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
          }
        });
        console.log(`Success: ${article.content?.length || 0} -> ${enrichedData.content.length} chars`);
        successCount++;
      } else {
        console.log(`No improvement: ${article.title.substring(0, 40)}`);
        failCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error: ${article.title.substring(0, 40)}`, error instanceof Error ? error.message : String(error));
      failCount++;
    }
  }

  console.log(`\nCompleted: Success ${successCount}, Failed ${failCount}`);
}

(async () => {
  try {
    await enrichShortArticles();
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    try {
      await prisma.$disconnect();
    } catch (_) {
      // Ignore disconnect errors
    }
  }
})();
