import { PrismaClient, Prisma } from '@prisma/client';
import { ContentEnricherFactory } from '@/lib/enrichers';
import { AIService } from '@/lib/ai/ai-service';

const prisma = new PrismaClient();

interface ReEnrichOptions {
  maxContentLength?: number;
  sourceName?: string;
  dryRun?: boolean;
}

async function reEnrichAllShortArticles(options: ReEnrichOptions = {}) {
  const maxContentLength = options.maxContentLength || 500;
  const dryRun = options.dryRun || false;

  console.log('開始: 短いコンテンツ記事の一括再エンリッチメント');
  console.log(`対象: ${maxContentLength}文字以下のコンテンツ`);
  if (options.sourceName) {
    console.log(`ソースフィルタ: ${options.sourceName}`);
  }
  if (dryRun) {
    console.log('ドライランモード: データは更新されません');
  }

  const enricherFactory = new ContentEnricherFactory();
  const aiService = new AIService({
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    preferLocalLLM: false,
    useLocalLLMFallback: false,
  });

  let successCount = 0;
  let failureCount = 0;
  let summaryRegeneratedCount = 0;
  let skippedCount = 0;

  try {
    // 生SQLクエリで効率的にLENGTH(content)でフィルタリング
    const sourceCondition = options.sourceName
      ? Prisma.sql`AND a."sourceId" IN (SELECT id FROM "Source" WHERE name = ${options.sourceName})`
      : Prisma.empty;

    const shortArticles = await prisma.$queryRaw<Array<{
      id: string;
      title: string;
      url: string;
      content: string;
      createdAt: Date;
      sourceName: string;
    }>>`
      SELECT
        a.id,
        a.title,
        a.url,
        a.content,
        a."createdAt",
        s.name as "sourceName"
      FROM "Article" a
      JOIN "Source" s ON a."sourceId" = s.id
      WHERE a.content IS NOT NULL
      AND LENGTH(a.content) <= ${maxContentLength}
      ${sourceCondition}
      ORDER BY a."createdAt" DESC
    `;

    console.log(`\n対象記事数: ${shortArticles.length}件`);

    for (const article of shortArticles) {
      try {
        console.log(`\n[${article.sourceName}] ${article.title.substring(0, 60)}...`);
        console.log(`  現在のコンテンツ長: ${article.content?.length || 0}文字`);

        const enricher = enricherFactory.getEnricher(article.url);
        if (!enricher) {
          console.warn(`  ⚠️ エンリッチャーが見つかりません: ${article.url}`);
          skippedCount++;
          continue;
        }

        if (dryRun) {
          console.log(`  [DRY RUN] エンリッチメント実行をスキップ`);
          continue;
        }

        const enrichedData = await enricher.enrich(article.url);

        if (enrichedData && enrichedData.content && enrichedData.content.length >= maxContentLength) {
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
          const enrichedLength = enrichedData?.content?.length || 0;
          console.warn(`  ⚠️ エンリッチメント結果が不十分: ${enrichedLength}文字`);

          // コンテンツが少しでも増えた場合は部分的成功としてカウント
          if (enrichedLength > (article.content?.length || 0)) {
            console.log(`  📊 部分的改善: ${article.content?.length} → ${enrichedLength}文字`);
          }

          failureCount++;
        }

        // Rate limit対策
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
        failureCount++;
      }
    }

    console.log(`\n========================================`);
    console.log(`完了サマリー:`);
    console.log(`  エンリッチメント成功: ${successCount}件`);
    console.log(`  エンリッチメント失敗: ${failureCount}件`);
    console.log(`  要約再生成成功: ${summaryRegeneratedCount}件`);
    console.log(`  スキップ: ${skippedCount}件`);
    console.log(`  合計処理: ${shortArticles.length}件`);
    console.log(`========================================`);

  } catch (error) {
    console.error('致命的エラー:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: ReEnrichOptions = {};

  // --dry-run フラグ
  if (args.includes('--dry-run')) {
    options.dryRun = true;
  }

  // --source="ソース名" オプション
  const sourceArg = args.find(arg => arg.startsWith('--source='));
  if (sourceArg) {
    options.sourceName = sourceArg.split('=')[1];
  }

  // --max-length=数値 オプション
  const maxLengthArg = args.find(arg => arg.startsWith('--max-length='));
  if (maxLengthArg) {
    options.maxContentLength = parseInt(maxLengthArg.split('=')[1], 10);
  }

  reEnrichAllShortArticles(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { reEnrichAllShortArticles };
