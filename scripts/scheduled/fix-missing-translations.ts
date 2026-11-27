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
              await prisma.$executeRaw`
                UPDATE "Article"
                SET "titleTranslationSkippedAt" = ${new Date()}
                WHERE id = ${article.id} AND "translatedTitle" IS NULL
              `;
              untranslatableCount++;
              console.error(`  UNTRANSLATABLE [${article.id}] Model returned the original title`);
              return;
            case 'failed':
              failureCount++;
              console.error(`  ERROR [${article.id}] ${summarizeError(outcome.error)}`);
              return;
            case 'translated':
              break;
          }

          const translatedTitle = outcome.text.trim();
          await prisma.article.update({
            where: { id: article.id },
            data: { translatedTitle }
          });

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

// CLI execution
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

fixMissingTranslations({ dryRun, limit })
  .catch((error) => {
    console.error(summarizeError(error, { stack: true }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
