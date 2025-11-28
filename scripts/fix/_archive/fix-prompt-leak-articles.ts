/**
 * プロンプト指示文混入記事の要約再生成スクリプト
 *
 * 対象: 38件の影響記事
 * 処理: summary フィールドを再生成（既存のSummaryManagerを使用）
 *
 * 注意: このスクリプトは既存記事のデータを上書きします。
 *       実行前にDBバックアップを取得することを推奨します。
 *
 * Usage:
 *   # バックアップ取得
 *   docker exec -it techtrend-postgres pg_dump -U postgres techtrend > backup/techtrend_before_fix_$(date +%Y%m%d_%H%M%S).sql
 *
 *   # 検証（再生成前のベースライン）
 *   npx tsx scripts/verify-fixed-summaries.ts
 *
 *   # 再生成実行
 *   SLEEP_MS=1000 npx tsx scripts/fix-prompt-leak-articles.ts
 *
 *   # 検証（再生成後の確認）
 *   npx tsx scripts/verify-fixed-summaries.ts
 */

import { PrismaClient } from '@prisma/client';
import { SummaryManager } from '../lib/services/summary-manager';
import * as fs from 'fs';

const AFFECTED_ARTICLE_IDS = [
  'cmds6eyds0005teoj7xzaw1kh',
  'cmdscuegk0005te0ph8x6tq49',
  'cmdv7qpiv0002teqxwae9ilor',
  'cmdwmreec0013tendrorf09ee',
  'cmdx01kyf0009tezhdqs79dnd',
  'cme3sdxlq0001te6gdt1epg49',
  'cme5etpjp000ate2awwrzp8ud',
  'cmebbevq3000etej0t3pxdbwo',
  'cmebhdfvf0012tecfwucv9zck',
  'cmec08osk002qte8akwwgmuki',
  'cmec0972w0040te8agsr3eugg',
  'cmei9do9j000hten0mg9097qg',
  'cmevf5k6f0008te9qidkurakt',
  'cmezcljve000vteocwk47xpzy',
  'cmf35k8c7000dte8xvpsqpuy9',
  'cmf35se1w004xte8xd4esuc7l',
  'cmf4l7y5g0050te1arxt8nnpk',
  'cmfffbgl80059tekt8uxfiv1f',
  'cmfqi1fw5000kte8dq5cmcc8d',
  'cmft25sjl000pte4nph24qbrk',
  'cmftgyzqk0001ter1ozo8nuqk',
  'cmfypj6t70005tejjvjwy66ud',
  'cmfzhejfc000btey608tr4ffn',
  'cmg6g7tyt000ftek50od6z14a',
  'cmg7rxzvc006xtec2awcr6d3u',
  'cmg7tmg90000ftemmpdxy7iwl',
  'cmglqgkii006zte0g2chkvptl',
  'cmgnwb2j00008te9vpn65mzou',
  'cmgsnvne40057tebdebcqnciy',
  'cmgt733gf000wtecymhg1lnqn',
  'cmgu14rt10039te8zw94mlu8b',
  'cmgw62b320001te2ix0iz44hv',
  'cmhfvic9r0001teboz95jelcq',
  'cmhv6e30p003ctef4f2ed0avt',
  'cmhvpt1om0020teyf7dgedtvl',
  'cmhvpt1qb0027teyfi86wk63b',
  'cmi82ann600etteag2556bpsi',
  'cmid08smy000stec4q1pxvbwk',
];

// 環境変数で調整可能（デフォルト1秒）
const SLEEP_MS = parseInt(process.env.SLEEP_MS || '1000', 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || '3', 10);

interface RegenerationResult {
  success: string[];
  failed: Array<{ id: string; error: string }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function regenerateWithRetry(
  summaryManager: SummaryManager,
  articleId: string,
  retries = MAX_RETRIES
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await summaryManager.regenerateSummaries({
        articleIds: [articleId],
        skipSummary: false,
        skipDetailedSummary: false,
      });
      return; // 成功
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Rate Limit (429) または 5xx エラーの場合はリトライ
      if (
        (errorMessage.includes('429') || errorMessage.includes('503') || errorMessage.includes('500')) &&
        attempt < retries
      ) {
        const backoffMs = SLEEP_MS * Math.pow(2, attempt - 1);
        console.log(`[Fix] Retry ${attempt}/${retries} after ${backoffMs}ms (${errorMessage})`);
        await sleep(backoffMs);
        continue;
      }

      // リトライ上限到達 or その他のエラー
      throw error;
    }
  }
}

async function main() {
  // IDリストのアサーション
  if (AFFECTED_ARTICLE_IDS.length !== 38) {
    console.error(`[Fix] ERROR: Expected 38 article IDs, but got ${AFFECTED_ARTICLE_IDS.length}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const summaryManager = new SummaryManager(prisma);

  try {
    console.log('[Fix] Starting prompt leak fix...');
    console.log(`[Fix] Target articles: ${AFFECTED_ARTICLE_IDS.length}`);
    console.log(`[Fix] Sleep interval: ${SLEEP_MS}ms`);
    console.log(`[Fix] Max retries: ${MAX_RETRIES}`);

    // 影響記事を取得
    const articles = await prisma.article.findMany({
      where: {
        id: { in: AFFECTED_ARTICLE_IDS },
      },
      select: {
        id: true,
        title: true,
        summary: true,
      },
    });

    console.log(`[Fix] Found ${articles.length} articles in database`);

    // 取得件数のアサーション
    if (articles.length !== 38) {
      console.error(`[Fix] ERROR: Expected 38 articles from database, but got ${articles.length}`);
      console.error('[Fix] Missing IDs:', AFFECTED_ARTICLE_IDS.filter(id => !articles.some(a => a.id === id)));
      process.exit(1);
    }

    // 再生成実行
    const results: RegenerationResult = {
      success: [],
      failed: [],
    };

    for (const article of articles) {
      console.log(`\n[Fix] Processing: ${article.id}`);
      console.log(`[Fix]   Title: ${article.title}`);
      console.log(`[Fix]   Current summary: ${article.summary?.substring(0, 100)}...`);

      try {
        await regenerateWithRetry(summaryManager, article.id);
        results.success.push(article.id);
        console.log(`[Fix] ✓ Success`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.failed.push({ id: article.id, error: errorMessage });
        console.error(`[Fix] ✗ Failed: ${errorMessage}`);
      }

      // Rate Limit 対策
      await sleep(SLEEP_MS);
    }

    // 結果サマリー
    console.log(`\n[Fix] Completed:`);
    console.log(`[Fix] - Success: ${results.success.length}`);
    console.log(`[Fix] - Failure: ${results.failed.length}`);

    // 失敗したIDをJSON形式で出力（再実行用）
    if (results.failed.length > 0) {
      const failedIds = results.failed.map(f => f.id);
      const failedIdsJson = JSON.stringify(failedIds, null, 2);
      const failedDetailsJson = JSON.stringify(results.failed, null, 2);

      console.log(`\n[Fix] Failed article IDs (${results.failed.length}):`);
      console.log(failedIdsJson);

      console.log(`\n[Fix] Failed details:`);
      console.log(failedDetailsJson);

      // ファイル保存
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const failedIdsFile = `failed-article-ids-${timestamp}.json`;
      const failedDetailsFile = `failed-article-details-${timestamp}.json`;

      fs.writeFileSync(failedIdsFile, failedIdsJson);
      fs.writeFileSync(failedDetailsFile, failedDetailsJson);

      console.log(`\n[Fix] Saved to files:`);
      console.log(`[Fix]   - ${failedIdsFile}`);
      console.log(`[Fix]   - ${failedDetailsFile}`);

      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[Fix] Fatal error:', error);
  process.exit(1);
});
