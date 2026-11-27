import { createPrismaClient } from '@/lib/prisma/create-client';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { backfillTitleTranslation } from '@/lib/ai/translator/backfill-title-translation';
import { GeminiCallTally } from '@/lib/ai/gemini-call-tally';
import {
  isLikelyJapanese,
  isLikelyJapaneseBody,
} from '@/lib/utils/language-detection';
import { summarizeError } from '@/lib/utils/sanitize-error';

const prisma = createPrismaClient();

// キャッシュの破棄を待つ上限（scripts/scheduled/classify-off-topic.ts と同じ）
const CACHE_INVALIDATION_TIMEOUT_MS = 30_000;

interface FixOptions {
  dryRun?: boolean;
  limit?: number;
  batchSize?: number;
}

async function fixMissingTranslations(options: FixOptions = {}) {
  const {
    dryRun = false,
    limit = 2557,
    batchSize = 10,
  } = options;

  console.error(`\n=== Translation Fix Script ===`);
  console.error(`Mode: ${dryRun ? 'Dry Run' : 'Production'}`);
  console.error(`Target: Up to ${limit} articles, Batch size: ${batchSize} articles/min\n`);

  // 1. Extract target articles
  // 日本語タイトルの記事は SQL で除く。件数で先に打ち切ってから除くと、訳さない記事が毎回枠を
  // 占めて古い英語記事に届かない（issue #725）。本文は判定に使う先頭 3000 字だけ読む
  const allArticles = await prisma.$queryRaw<
    { id: string; title: string; summary: string; content: string | null }[]
  >`
    SELECT id, title, summary, left(content, 3000) AS content
    FROM "Article"
    WHERE "translatedTitle" IS NULL
      AND "titleTranslationSkippedAt" IS NULL
      AND summary IS NOT NULL
      AND title !~ '[\u3000-\u30FF\u4E00-\u9FFF]'
    ORDER BY "publishedAt" DESC
  `;

  // Filter English articles (excluding Japanese titles and Japanese bodies with English titles)
  const articles = allArticles
    .filter(article => !isLikelyJapanese(article.title) && !isLikelyJapaneseBody(article.content))
    .slice(0, limit);

  console.error(`Target articles: ${articles.length}\n`);

  if (dryRun) {
    console.error('Dry Run complete. No actual processing was performed.');
    return;
  }

  const { translator: titleTranslator } = getAppDependencies();

  let successCount = 0;
  let failureCount = 0;
  let untranslatableCount = 0;
  let skipCount = 0;
  // Gemini の呼び出しが届いた数・届かなかった数。DB の失敗は数えない
  const tally = new GeminiCallTally();
  // 訳を書いた記事。最後にキャッシュを捨てる
  const translatedIds: string[] = [];

  // 2. Batch processing
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    console.error(`\nProcessing: ${i + 1}-${Math.min(i + batchSize, articles.length)} articles`);

    await Promise.all(
      batch.map(async (article) => {
        try {
          // Skip if already translated
          const current = await prisma.article.findUnique({
            where: { id: article.id },
            select: { translatedTitle: true }
          });

          if (current?.translatedTitle?.trim()) {
            skipCount++;
            return;
          }

          // Execute translation
          const requestId = `fix-translation-${article.id}-${Date.now()}`;
          const outcome = await backfillTitleTranslation(
            titleTranslator,
            {
              title: article.title,
              summary: article.summary ?? undefined,
              content: article.content ?? undefined,
              requestId,
            },
            tally
          );

          switch (outcome.kind) {
            case 'not_needed':
              skipCount++;
              console.error(`  SKIP [${article.id}] Japanese article detected or translation disabled`);
              return;
            case 'untranslatable':
              // 要約あり・なしの両方で原文のまま返った。印を付けて、次の実行から対象にしない
              // （その間に毎時の要約が訳を書いていたら、印は付けない）。
              // 印の列だけを生の SQL で書く。Prisma の update は @updatedAt を書き換え、updatedAt を
              // 差分の取得に使う処理を無駄に動かすため（lib/articles/off-topic-classifier.ts の writeVerdicts と同じ）
              const marked = await prisma.$executeRaw`
                UPDATE "Article"
                SET "titleTranslationSkippedAt" = ${new Date()}
                WHERE id = ${article.id} AND "translatedTitle" IS NULL
              `;
              if (marked === 0) {
                skipCount++;
                return;
              }
              untranslatableCount++;
              // タイトルは公開の RSS の値。誤って印を付けた記事をログから見直せるように出す
              console.error(`  UNTRANSLATABLE [${article.id}] ${article.title.substring(0, 60)}`);
              return;
            case 'failed':
              failureCount++;
              console.error(`  ERROR [${article.id}] ${summarizeError(outcome.error)}`);
              return;
            case 'translated':
              break;
          }

          const translatedTitle = outcome.text;
          // 訳を待つ間に毎時の要約が訳を書いていたら、上書きしない
          const updated = await prisma.article.updateMany({
            where: { id: article.id, translatedTitle: null },
            data: { translatedTitle }
          });
          if (updated.count === 0) {
            skipCount++;
            return;
          }

          translatedIds.push(article.id);
          successCount++;
          console.error(`  SUCCESS [${article.id}] ${translatedTitle.substring(0, 40)}...`);

        } catch (error) {
          failureCount++;
          console.error(`  ERROR [${article.id}] ${summarizeError(error)}`);
        }
      })
    );

    // Rate limit mitigation: Wait 60 seconds
    if (i + batchSize < articles.length) {
      console.error(`\nWaiting 60 seconds to avoid API rate limits...`);
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }

  if (translatedIds.length > 0) {
    await invalidateTranslatedArticles(translatedIds);
  }

  console.error(`\n\n=== Fix Summary ===`);
  console.error(`  Success: ${successCount} articles`);
  console.error(`  Untranslatable (marked): ${untranslatableCount} articles`);
  console.error(`  Failure: ${failureCount} articles`);
  console.error(`  Skipped: ${skipCount} articles`);
  console.error(`  Total: ${articles.length} articles`);
  console.error(`  ${tally.summary()}\n`);

  // Gemini の呼び出しが 1 件も届かなかった回は失敗で終え、ワークフローの通知に載せる（lib/ai/gemini-call-tally.ts）
  if (tally.allFailed) {
    console.error(`All ${tally.failed} translation API requests failed`);
    process.exitCode = 1;
  }
}

/**
 * 訳を書いた記事のキャッシュを捨てる。一覧（訳を表示に使う）は onBulkImport で 1 回だけ消し、
 * 詳細は記事ごとにキーを消す（auto-regenerate-low-quality.ts と同じく、onArticleUpdated は
 * 一覧のキャッシュを消さず、記事ごとに Redis の全キーを走査するので使わない）。
 * 捨てられなくても訳は保存済みなので失敗にはしない（一覧は TTL の間、古い表示が残る）
 */
async function invalidateTranslatedArticles(articleIds: string[]): Promise<void> {
  try {
    // 読み込んだだけで Redis につなぐので、要るときだけ読み込む
    const [{ cacheInvalidator }, { articleDetailCache }] = await Promise.all([
      import('@/lib/cache/cache-invalidator'),
      import('@/lib/cache/article-detail-cache'),
    ]);
    await Promise.race([
      (async () => {
        await cacheInvalidator.onBulkImport();
        for (const id of articleIds) {
          await articleDetailCache.invalidateArticle(id);
        }
      })(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Cache invalidation timed out')),
          CACHE_INVALIDATION_TIMEOUT_MS
        ).unref()
      ),
    ]);
  } catch (error) {
    console.error(`  WARN cache invalidation failed: ${summarizeError(error)}`);
  }
}

// CLI execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

// Redis の接続が残るとプロセスが終わらないので、終わったら明示的に抜ける（classify-off-topic.ts と同じ）
fixMissingTranslations({ dryRun, limit })
  .catch((error) => {
    console.error(summarizeError(error, { stack: true }));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } catch {
      // 切断に失敗しても終了する（例外の本文を公開されるログに出さない）
    }
    // 引数なしの process.exit は process.exitCode で終わる
    process.exit();
  });
