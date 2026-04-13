import { createPrismaClient } from '@/lib/prisma/create-client';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { AIService } from '@/lib/ai/ai-service';

const prisma = createPrismaClient();

const AFFECTED_ARTICLE_IDS = [
  'cmgkcfh8t0035te5ro5zpm068',  // AI時代の働き方
  'cmgkcfh720031te5rfbidvcy1',  // リモートワーク
  'cmgkcfh61002xte5rq54hfm0n',  // Ruby 3.3
  'cmgkcfh45002tte5r659andwq',  // YANS2025
];

async function reEnrichArticles() {
  console.log('開始: Money Forward記事の再エンリッチメント');
  console.log(`対象記事数: ${AFFECTED_ARTICLE_IDS.length}`);

  const enricherFactory = new ContentEnricherFactory();
  const aiService = new AIService({
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    preferLocalLLM: false,
    useLocalLLMFallback: false,
  });

  let successCount = 0;
  let failureCount = 0;
  let summaryRegeneratedCount = 0;

  for (const articleId of AFFECTED_ARTICLE_IDS) {
    try {
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: { id: true, title: true, url: true, content: true }
      });

      if (!article) {
        console.error(`記事が見つかりません: ${articleId}`);
        failureCount++;
        continue;
      }

      console.log(`\n処理中: ${article.title}`);
      console.log(`  現在のコンテンツ長: ${article.content?.length || 0}文字`);

      const enricher = enricherFactory.getEnricher(article.url);
      if (!enricher) {
        console.error(`  エンリッチャーが見つかりません`);
        failureCount++;
        continue;
      }

      const enrichedData = await enricher.enrich(article.url);

      if (enrichedData && enrichedData.content && enrichedData.content.length >= 500) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            content: enrichedData.content,
            contentUpdatedAt: new Date(),
            ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
          }
        });

        console.log(`  ✅ エンリッチメント成功: ${enrichedData.content.length}文字に更新`);

        // 詳細要約を再生成
        try {
          console.log(`  詳細要約を再生成中...`);
          const summaryResult = await aiService.generateDetailedSummary(
            article.title,
            enrichedData.content
          );

          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: summaryResult.summary,
              detailedSummary: summaryResult.detailedSummary,
              tags: {
                set: [],
                connectOrCreate: summaryResult.tags.map(tagName => ({
                  where: { name: tagName },
                  create: { name: tagName }
                }))
              }
            }
          });

          console.log(`  ✅ 詳細要約再生成成功: ${summaryResult.detailedSummary.length}文字`);
          summaryRegeneratedCount++;
        } catch (summaryError) {
          console.error(`  ⚠️ 詳細要約再生成エラー:`, summaryError instanceof Error ? summaryError.message : String(summaryError));
        }

        successCount++;
      } else {
        console.error(`  ⚠️ エンリッチメント結果が不十分: ${enrichedData?.content?.length || 0}文字`);
        failureCount++;
      }

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
      failureCount++;
    }
  }

  console.log(`\n完了: エンリッチメント成功${successCount}件, 失敗${failureCount}件, 要約再生成${summaryRegeneratedCount}件`);

  await prisma.$disconnect();
}

if (require.main === module) {
  reEnrichArticles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { reEnrichArticles };
