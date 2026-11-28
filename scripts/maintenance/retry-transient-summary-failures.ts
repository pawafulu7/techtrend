/**
 * 一時的な障害で要約を諦めた記事を、要約の対象に戻して作り直す。
 *
 * 要約は一時的な失敗が2回続くと QUALITY_FAILED にして諦める（lib/summary/batch-processor.ts）。障害が続いた
 * 時期（DB のトランザクションの失敗、AI の遮断・503、API キーの期限切れ、提供を終えたモデル）の記事は、本文に
 * 問題が無いのに諦められたまま残る。取り込みから日が経っているので、期間で切る定期の要約にも拾われない。
 * ここでは記事を ID で指定して作り直す。
 *
 * 作り直す前に skipReason だけを外し、summaryError（前回の失敗）は残す。要約を保存すると両方が消える。
 * 途中で止まっても、残った記事は次に流したときに同じ条件で拾える。作り直しがまた一時的な失敗になった記事は、
 * 前回の失敗が残っているので QUALITY_FAILED に戻る（次に流したときにまた拾う）
 *
 * 使い方:
 *   npx tsx scripts/maintenance/retry-transient-summary-failures.ts [--dry-run] [--limit=n]
 *
 * 本番では GitHub Actions の Maintenance - Run Script で流す。画面に出るのは最後の `名前=数値` の行だけ
 */

import { SkipReason } from '@/lib/prisma-exports';
import type { Prisma } from '@/lib/prisma-exports';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { getPrismaClient } from '@/lib/cli/utils/database';
import { env } from '@/lib/config/env';
import { SummaryManager } from '@/lib/summary/summary-manager';
import { CONTENT_FETCH_FAILURE_PREFIX } from '@/lib/summary/pending-articles';
import { summarizeError } from '@/lib/utils/sanitize-error';

/**
 * 一時的な障害の印（summaryError に含まれる文）。本文や要約の出来が原因の失敗（品質の不足、AI の応答の
 * 解析の失敗、候補の無い応答）は入れない。作り直しても同じ結果になりやすいため。
 * 作り直しがまた別の一時的な失敗（429 など）になると summaryError はその文に書き換わるので、AI の一時的な
 * 失敗は個別の状態コードではなく、AI のアダプタが付ける前置き（gemini-summary-adapter.ts）で見る
 */
export const TRANSIENT_FAILURE_MARKERS: readonly string[] = [
  // 要約は作れたが、保存のトランザクションが失敗した
  'Transaction API error',
  // AI の呼び出しが続けて失敗し、遮断していた
  'Circuit breaker is open',
  // AI のアダプタが一時的と判定した失敗（混雑・時間切れ・429 など）
  'Retryable error during summarization',
  // 設定の不備（後で直した）
  'API key expired',
  'is no longer available',
];

/** 1回の作り直しで渡す記事の数 */
const CHUNK_SIZE = 20;

interface Options {
  dryRun: boolean;
  limit?: number;
}

export function parseArgs(args: string[]): Options {
  const options: Options = { dryRun: false };
  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      const raw = arg.slice('--limit='.length);
      const limit = Number(raw);
      // 1.5 や 10oops を切り詰めて受け付けない
      if (raw === '' || !Number.isInteger(limit) || limit <= 0) {
        throw new Error('--limit には1以上の整数を指定してください');
      }
      options.limit = limit;
    } else {
      throw new Error(`不明な引数です: ${arg}`);
    }
  }
  return options;
}

/**
 * 作り直す記事の条件。要約が無く、前回の失敗が一時的な障害のもの。
 * skipReason が NULL のもの（作り直しの途中で止まった記事）も含める。本文を取れなかった理由（毎時の収集が
 * summaryError に書く）は除く。本文が無いので作り直せない
 */
export function transientSummaryFailureWhere(): Prisma.ArticleWhereInput {
  return {
    AND: [
      { OR: [{ summary: null }, { summary: '' }] },
      { OR: [{ skipReason: SkipReason.QUALITY_FAILED }, { skipReason: null }] },
      {
        OR: TRANSIENT_FAILURE_MARKERS.map((marker) => ({
          summaryError: { contains: marker },
        })),
      },
      { NOT: { summaryError: { startsWith: CONTENT_FETCH_FAILURE_PREFIX } } },
    ],
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const prisma = getPrismaClient();

  try {
    if (!options.dryRun && !env.GEMINI_API_KEY) {
      // キーが無いと記事ごとに失敗し、QUALITY_FAILED に戻るだけになる
      console.error('GEMINI_API_KEY is not set');
      process.exitCode = 1;
      return;
    }

    const where = transientSummaryFailureWhere();
    const targets = await prisma.article.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
    console.error(`対象: ${targets.length}件${options.dryRun ? '（ドライラン）' : ''}`);

    let reset = 0;
    let generated = 0;
    let errors = 0;
    let skipped = 0;

    if (!options.dryRun && targets.length > 0) {
      const manager = new SummaryManager(prisma);
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE).map((target) => target.id);
        // 選んだ後に別の処理が要約を作ったか、別の skipReason（本文不足など）を付けていたら戻さない（同じ条件で
        // 絞る）。要約に渡すのは戻せた記事だけにする。ID を指定した要約は skipReason を見ずに作り、保存で
        // skipReason を消すので、渡すと別の処理が付けた印を消してしまう
        const resetRows = await prisma.article.updateManyAndReturn({
          where: { id: { in: chunk }, ...where },
          data: { skipReason: null },
          select: { id: true },
        });
        reset += resetRows.length;
        if (resetRows.length === 0) continue;

        const result = await manager.generateSummaries({
          articleIds: resetRows.map((row) => row.id),
        });
        generated += result.generated;
        errors += result.errors;
        skipped += result.skipped ?? 0;
        console.error(
          `[${Math.min(i + CHUNK_SIZE, targets.length)}/${targets.length}] generated=${generated} errors=${errors} skipped=${skipped}`
        );
      }
    }

    if (generated > 0) {
      // 記事ごとのキャッシュは要約の保存で消える（batch-processor.ts）が、一覧のキャッシュは消えないので、
      // 最後にまとめて消す（collect-feeds の要約生成の後と同じ）。書き込みは済んでいるので失敗は警告に留める
      try {
        await cacheInvalidator.onBulkImport();
      } catch (cacheError) {
        console.error(
          '警告: 一覧のキャッシュの無効化に失敗しました（TTL で切れます）:',
          summarizeError(cacheError)
        );
      }
    }

    console.log(`dry_run=${options.dryRun}`);
    console.log(`targets=${targets.length}`);
    console.log(`reset=${reset}`);
    console.log(`generated=${generated}`);
    console.log(`errors=${errors}`);
    console.log(`skipped=${skipped}`);

    // 作り直しを試みた記事が1件も作れなければ失敗として終わる（障害が続いている、または設定の不備）
    if (generated === 0 && errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

// 要約の仕組みが開く接続（Redis など）が残るとプロセスが終わらないので、終わったら明示して抜ける
// （manage-summaries.ts と同じ）
if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode || 0))
    .catch((error) => {
      console.error('実行エラー:', summarizeError(error, { stack: true }));
      process.exit(1);
    });
}
