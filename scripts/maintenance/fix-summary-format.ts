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

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// プロンプト行を検出する正規表現パターン
const INSTRUCTION_PATTERNS = [
  /^【条件】/,
  /^【重要/,
  /^【書き方】/,
  /^- \d+文字以上の記事/,
  /^-\s*記事の核心的な内容/,
  /^-\s*技術的価値を/,
];

// カテゴリ的なラベル（削除対象）
const CATEGORY_LABELS = ['技術概要', '詳細', '背景', '概要', '実装', '効果', '結果', '考察', '展望', '課題', '問題', '解決策', '方法', '手順', '注意点'];

// タイトル判定のしきい値
const TITLE_CHAR_THRESHOLD = 60;
const SENTENCE_MARKERS = /[。．！？]/;

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

    if (trimmed.startsWith('・') || trimmed.startsWith('-')) {
      // 前の項目を保存
      if (currentItem) {
        fixed.push(`・${currentItem.title}：${currentItem.content}`);
      }

      // 新しい項目を開始
      const match = trimmed.match(/^[・-]\s*(.+?)[:：]\s*(.*)$/);
      if (match) {
        const firstPart = match[1].trim();
        const secondPart = match[2].trim();
        const isCategory = CATEGORY_LABELS.includes(firstPart);
        const nextLine = (lines[i + 1] ?? '').trim();
        const hasContinuation = nextLine && !/^[・\-]/.test(nextLine);

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
          const needsPeriod = !currentItem.content.endsWith('。') && !currentItem.content.endsWith('.') && !currentItem.content.endsWith('、');
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

  for (const article of articles) {
    try {
      // 一覧要約の修正（プロンプト混入除去）
      let fixedSummary = article.summary;
      if (fixedSummary && INSTRUCTION_PATTERNS.some(p => p.test(fixedSummary))) {
        const summaryLines = fixedSummary.split('\n');
        fixedSummary = summaryLines
          .filter(line => !INSTRUCTION_PATTERNS.some(p => p.test(line.trim())))
          .join(' ')
          .trim();
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
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: fixedSummary,
              detailedSummary: fixedDetailedSummary,
            },
          });
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
  console.log(`修正: ${fixedCount}件`);
  console.log(`未変更: ${unchangedCount}件`);
  console.log(`エラー: ${errorCount}件`);

  if (isDryRun) {
    console.log('');
    console.log('※ DRY RUNモードのため、データベースは更新されていません');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
