#!/usr/bin/env npx tsx
/**
 * arXiv AI記事のコンテンツを再取得（エンリッチ）
 * HTTPエラーでフォールバックになった記事を対象に、HTML版を再取得
 */

import { PrismaClient } from '@prisma/client';
import { ArxivAIEnricher } from '../../lib/enrichers/arxiv-ai';

const prisma = new PrismaClient();

// arXiv AI ソースID
const ARXIV_SOURCE_ID = 'cmfxa7efs0001teo0kjt70c5k';

// 並列数（レート制限回避のため低めに設定）
const CONCURRENCY = 2;

// リクエスト間の待機時間（ミリ秒）
const REQUEST_DELAY = 3000;

async function reEnrichArxivContent() {
  console.log('========================================');
  console.log('arXiv AI記事のコンテンツ再取得');
  console.log('========================================\n');

  const enricher = new ArxivAIEnricher();

  // コンテンツが短い記事を取得（1000文字以下 = フォールバックコンテンツ）
  const articles = await prisma.$queryRaw<Array<{
    id: string;
    title: string;
    url: string;
    content: string | null;
    content_len: number;
  }>>`
    SELECT id, title, url, content, LENGTH(content) as content_len
    FROM "Article"
    WHERE "sourceId" = ${ARXIV_SOURCE_ID}
      AND LENGTH(content) < 1000
    ORDER BY "publishedAt" DESC
    LIMIT 200
  `;

  console.log(`対象記事数: ${articles.length}件\n`);
  console.log(`並列数: ${CONCURRENCY}, リクエスト間隔: ${REQUEST_DELAY}ms\n`);

  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  // 順次処理（レート制限回避）
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`\n[${i + 1}/${articles.length}] ${article.title.substring(0, 60)}...`);
    console.log(`  URL: ${article.url}`);
    console.log(`  現在: ${article.content_len}文字`);

    try {
      const result = await enricher.enrich(article.url);

      if (result && result.content && result.content.length > 1000) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            content: result.content,
            thumbnail: result.thumbnail || undefined,
          },
        });
        console.log(`  ✅ 成功: ${result.content.length}文字に更新`);
        enriched++;
      } else {
        const len = result?.content?.length || 0;
        console.log(`  ⚠️ HTML版なし (${len}文字) - スキップ`);
        skipped++;
      }
    } catch (error) {
      console.log(`  ❌ エラー: ${error instanceof Error ? error.message : error}`);
      failed++;
    }

    // レート制限対策の待機
    if (i < articles.length - 1) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY));
    }
  }

  console.log('\n========================================');
  console.log('処理完了');
  console.log('========================================\n');
  console.log(`エンリッチ成功: ${enriched}件`);
  console.log(`HTML版なし: ${skipped}件`);
  console.log(`エラー: ${failed}件`);

  await prisma.$disconnect();
}

// 実行
reEnrichArxivContent().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
