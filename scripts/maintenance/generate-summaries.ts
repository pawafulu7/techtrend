import { PrismaClient } from '@prisma/client';
import { SummaryManager } from '@/lib/services/summary-manager';
import { createNotifierFromEnv } from '@/lib/notification';
import type { ArticleInfo } from '@/lib/notification/types';

const prisma = new PrismaClient();

interface GenerateResult {
  generated: number;
  errors: number;
}

interface GenerateSummariesOptions {
  articleIds?: string[];
}

async function generateSummaries(options: GenerateSummariesOptions = {}): Promise<GenerateResult> {
  console.error('📝 要約とタグの生成を開始します...');
  const summaryManager = new SummaryManager(prisma);
  const startTime = new Date();

  try {
    const result = await summaryManager.generateSummaries({
      articleIds: options.articleIds,
    });

    console.error('📊 要約とタグ生成完了:');
    console.error(`   - 生成済み: ${result.generated}件`);
    console.error(`   - エラー: ${result.errors}件`);
    console.error(`   - スキップ: ${result.skipped}件`);

    // Slack notification (only when new summaries were generated)
    if (result.generated > 0) {
      try {
        const notifier = createNotifierFromEnv();
        if (notifier) {
          // Always include summaryComputedAt >= startTime to prevent notifying old articles
          const processedArticles = await prisma.article.findMany({
            where: {
              summaryComputedAt: { gte: startTime },
              summary: { not: null },
              ...(options.articleIds?.length && { id: { in: options.articleIds } })
            },
            select: {
              title: true,
              translatedTitle: true,
              url: true,
              source: { select: { name: true } }
            },
            orderBy: { summaryComputedAt: 'desc' }
          });

          if (processedArticles.length > 0) {
            const articlesForNotification: ArticleInfo[] = processedArticles.map(a => ({
              title: a.title,
              translatedTitle: a.translatedTitle,
              url: a.url,
              sourceName: a.source.name
            }));

            await notifier.send({
              newArticles: processedArticles.length,
              duplicates: 0,
              updated: 0,
              newArticleIds: [],
              articles: articlesForNotification,
              durationSeconds: Math.round((Date.now() - startTime.getTime()) / 1000)
            });
            console.error('[INFO] Slack notification sent successfully');
          }
        }
      } catch (notifyError) {
        console.error(
          '[WARN] Slack notification failed:',
          notifyError instanceof Error ? notifyError.message : String(notifyError)
        );
      }
    }

    return {
      generated: result.generated,
      errors: result.errors,
    };
  } catch (error) {
    console.error('❌ 要約生成でエラーが発生しました:', error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

export { generateSummaries };
