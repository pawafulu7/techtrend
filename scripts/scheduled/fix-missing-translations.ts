import { createPrismaClient } from '@/lib/prisma/create-client';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { TitleTranslationRequestError } from '@/lib/ai/translator/gemini-title-translator';
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
  // 翻訳の呼び出しのうち、API に届かなかったもの（HTTP エラー・タイムアウトなど）と、
  // 応答が返ったもの（訳せた・製品名だけのタイトルを原文のまま返したなど）。DB の失敗は数えない
  let requestFailureCount = 0;
  let apiReachedCount = 0;
  let skipCount = 0;

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
          let translated: string | null;
          try {
            translated = await titleTranslator.translateTitle({
              title: article.title,
              summary: article.summary ?? undefined,
              content: article.content ?? undefined,
              requestId,
            });
          } catch (error) {
            if (error instanceof TitleTranslationRequestError) {
              requestFailureCount++;
            } else {
              apiReachedCount++;
            }
            throw error;
          }
          // null は API を呼ばずに訳さないと決めた場合を含むので、届いた件数に数えない
          if (translated !== null) {
            apiReachedCount++;
          }

          // Handle null response (Japanese title detected or translation disabled)
          if (translated === null) {
            skipCount++;
            console.error(`  SKIP [${article.id}] Japanese article detected or translation disabled`);
            return;
          }

          const translatedTitle = translated.trim();

          if (translatedTitle) {
            await prisma.article.update({
              where: { id: article.id },
              data: { translatedTitle }
            });

            successCount++;
            console.error(`  SUCCESS [${article.id}] ${translatedTitle.substring(0, 40)}...`);
          } else {
            failureCount++;
            console.error(`  FAILURE [${article.id}] Empty translation result`);
          }

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
  console.error(`  Failure: ${failureCount} articles (API request failed: ${requestFailureCount})`);
  console.error(`  Skipped: ${skipCount} articles`);
  console.error(`  Total: ${articles.length} articles\n`);

  // API の呼び出しが 1 件も通らなかったときは、終了コードで失敗を返し、ワークフローの通知に載せる
  // （以前は全件 404 でも成功で終わり、数か月気づけなかった）。モデルの提供終了・API キーの不備・
  // 利用上限のほか、その回の対象すべてが一時的な障害で落ちたときも通知される。
  // 応答が返ったが訳文として使えなかった記事は毎回残りうるので、通知の条件には入れない
  if (requestFailureCount > 0 && apiReachedCount === 0) {
    console.error(`All ${requestFailureCount} translation API requests failed`);
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
