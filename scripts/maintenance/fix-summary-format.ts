/**
 * 詳細要約のフォーマット修正スクリプト
 *
 * 問題:
 * - カテゴリ：項目名 形式が混在
 * - プロンプト内容が混入
 * - 項目が複数行に分かれている
 *
 * 修正内容:
 * - カテゴリラベルを削除し、項目名のみを保持
 * - プロンプト行を除外
 * - 各項目を1行に連結（句点補完）
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import { INSTRUCTION_PATTERNS, CATEGORY_LABELS, TITLE_CHAR_THRESHOLD, SENTENCE_MARKERS } from '../../lib/ai/constants';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import { closeRedisConnection } from '@/lib/redis/client';

const prisma = createPrismaClient();
const embeddingScheduler = new EmbeddingScheduler(prisma);

function fixDetailedSummaryFormat(detailedSummary: string): string {
  const lines = detailedSummary.split('\n');
  const fixed: string[] = [];
  let currentItem: { title: string; content: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // プロンプト行をスキップ
    const isInstruction = INSTRUCTION_PATTERNS.some(p => p.test(trimmed));
    if (isInstruction) continue;

    if (trimmed.startsWith('・') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
      // 前の項目を保存
      if (currentItem) {
        fixed.push(`・${currentItem.title}：${currentItem.content}`);
      }

      // 新しい項目を開始
      const match = trimmed.match(/^[・\-\*]\s*(.+?)[:：]\s*(.*)$/);
      if (match) {
        const firstPart = match[1].trim();
        const secondPart = match[2].trim();
        const isCategory = CATEGORY_LABELS.includes(firstPart);
        const nextLine = (lines[i + 1] ?? '').trim();
        const isNextInstruction = INSTRUCTION_PATTERNS.some(p => p.test(nextLine));
        const hasContinuation = nextLine && !isNextInstruction && !/^[・\-\*]/.test(nextLine);

        if (
          isCategory &&
          secondPart &&
          secondPart.length <= TITLE_CHAR_THRESHOLD &&
          !SENTENCE_MARKERS.test(secondPart) &&
          hasContinuation
        ) {
          // カテゴリ：タイトル 形式（次行に本文が続く）
          currentItem = { title: secondPart, content: '' };
        } else if (isCategory && secondPart) {
          // カテゴリ：内容 形式（secondPartが長文）
          // カテゴリを削除せず、そのまま保持
          currentItem = { title: firstPart, content: secondPart };
        } else {
          // 通常の項目：内容 形式
          currentItem = { title: firstPart, content: secondPart };
        }
      } else {
        // コロンがない行はスキップ
        console.warn(`Warning: Invalid format (no colon): ${trimmed.substring(0, 50)}...`);
        currentItem = null;
      }
    } else {
      // 継続行
      if (currentItem) {
        if (currentItem.content) {
          // 句点補完
          const needsPeriod = !/[。．！？!?、，\.,]$/.test(currentItem.content);
          currentItem.content += (needsPeriod ? '。' : '') + trimmed;
        } else {
          currentItem.content = trimmed;
        }
      }
    }
  }

  // 最後の項目を保存
  if (currentItem) {
    fixed.push(`・${currentItem.title}：${currentItem.content}`);
  }

  // 箇条書きが1件も変換されない場合は元のdetailedSummaryを返す
  if (fixed.length === 0) {
    return detailedSummary;
  }

  return fixed.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;

  console.log('詳細要約フォーマット修正スクリプト');
  console.log('=====================================');
  console.log(`モード: ${isDryRun ? 'DRY RUN（確認のみ）' : '実行'}`);
  console.log(`制限: ${limit ? `${limit}件` : 'なし（全件）'}`);
  console.log('');

  // 修正対象記事を取得
  const articles = await prisma.article.findMany({
    where: {
      summaryComputedAt: { not: null },
    },
    select: {
      id: true,
      title: true,
      summary: true,
      detailedSummary: true,
    },
    orderBy: {
      publishedAt: 'desc',
    },
    take: limit,
  });

  console.log(`対象記事数: ${articles.length}件`);
  console.log('');

  let fixedCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;
  let savedCount = 0;
  let staleCount = 0;

  for (const article of articles) {
    try {
      // 一覧要約の修正（プロンプト混入除去）
      let fixedSummary = article.summary;
      if (fixedSummary) {
        const summaryLines = fixedSummary.split('\n');
        const filteredLines = summaryLines.filter(line => !INSTRUCTION_PATTERNS.some(p => p.test(line.trim())));
        if (filteredLines.length !== summaryLines.length) {
          fixedSummary = filteredLines.join(' ').trim();
        }
      }

      // 詳細要約の修正
      const fixedDetailedSummary = article.detailedSummary
        ? fixDetailedSummaryFormat(article.detailedSummary)
        : article.detailedSummary;

      // 変更があるかチェック
      const summaryChanged = fixedSummary !== article.summary;
      const detailedChanged = fixedDetailedSummary !== article.detailedSummary;

      if (summaryChanged || detailedChanged) {
        fixedCount++;
        console.log(`[${fixedCount}] ${article.id}`);
        console.log(`  タイトル: ${article.title?.substring(0, 50)}...`);

        if (summaryChanged) {
          console.log(`  一覧要約変更:`);
          console.log(`    前: ${article.summary?.substring(0, 80)}...`);
          console.log(`    後: ${fixedSummary?.substring(0, 80)}...`);
        }

        if (detailedChanged) {
          console.log(`  詳細要約変更:`);
          const beforeLines = article.detailedSummary?.split('\n').slice(0, 2) || [];
          const afterLines = fixedDetailedSummary?.split('\n').slice(0, 2) || [];
          console.log(`    前: ${beforeLines.join(' | ')}`);
          console.log(`    後: ${afterLines.join(' | ')}`);
        }

        if (!isDryRun) {
          // 全件を読んでから順に書くので、その間に他の処理（要約の再生成など）が書き換えた記事を
          // 読んだときの値で上書きしない
          const { count } = await prisma.article.updateMany({
            where: {
              id: article.id,
              summary: article.summary,
              detailedSummary: article.detailedSummary,
            },
            data: {
              summary: fixedSummary,
              detailedSummary: fixedDetailedSummary,
              // 指示文だけの要約で空になったら、一覧から外して定期の要約生成に作り直させる
              // （収集で要約を消すときの SUMMARY_RESET と同じ）
              ...(summaryChanged && !fixedSummary ? { summaryComputedAt: null } : {}),
            },
          });
          if (count === 0) {
            staleCount++;
            console.log('  読んだ後に書き換えられていたので、更新しませんでした');
          } else {
            savedCount++;
            // 埋め込みはタイトルと一覧要約から作るので、一覧要約が変わったときだけ、保存の後に積む。
            // 空になった要約の埋め込みは DB のトリガーが消す（ワーカーは要約の無い記事を飛ばす）
            if (summaryChanged && fixedSummary) {
              await embeddingScheduler.enqueue(article.id);
            }
          }
        }
        console.log('');
      } else {
        unchangedCount++;
      }
    } catch (error) {
      errorCount++;
      console.error(`エラー: ${article.id}`);
      console.error(error);
      console.log('');
    }
  }

  console.log('=====================================');
  console.log('修正完了');
  // DRY RUN は直す対象の件数、実行時は実際に書いた件数（読んだ後に書き換えられた記事を除く）
  console.log(`修正: ${isDryRun ? fixedCount : savedCount}件`);
  console.log(`未変更: ${unchangedCount}件`);
  console.log(`エラー: ${errorCount}件`);
  if (staleCount > 0) {
    console.log(`読んだ後に書き換えられていて更新しなかった: ${staleCount}件`);
  }

  if (isDryRun) {
    console.log('');
    console.log('※ DRY RUNモードのため、データベースは更新されていません');
  }

  if (savedCount > 0) {
    // 要約を書き換えたので、一覧の表示のキャッシュを消す。失敗を投げるが、要約は保存済みなので
    // 警告に留める（キャッシュは TTL で切れる）
    try {
      await cacheInvalidator.onBulkImport();
    } catch (error) {
      console.error('警告: 一覧のキャッシュの無効化に失敗しました（TTL で切れます）:', error);
    }
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await prisma.$disconnect();
    } finally {
      // キャッシュのモジュールが読み込んだ時点で Redis に接続しているので、閉じないとプロセスが終わらない
      await closeRedisConnection();
    }
  });
