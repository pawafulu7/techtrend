/**
 * 項目数が不足している長文記事をCSVファイルにエクスポートするスクリプト
 *
 * 実行方法:
 * npx tsx scripts/fix/export-low-item-summaries.ts
 */

import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

/**
 * CSVフィールドを適切にエスケープする
 * @param value エスケープする値
 * @returns エスケープされたCSVフィールド
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    // ダブルクォートは二重にする
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

interface ProblemArticle {
  id: string;
  title: string;
  url: string;
  sourceName: string | null;
  contentLength: number;
  itemCount: number;
  summaryVersion: number | null;
  createdAt: Date;
}

async function exportLowItemSummaries() {
  console.log('項目数不足の記事を検索中...');

  try {
    // 5000文字以上で項目数が4以下の記事を取得
    const articles = await prisma.$queryRaw<ProblemArticle[]>`
      SELECT
        a.id,
        a.title,
        a.url,
        s.name as "sourceName",
        LENGTH(a.content) as "contentLength",
        LENGTH(a."detailedSummary") - LENGTH(REPLACE(a."detailedSummary", '・', '')) as "itemCount",
        a."summaryVersion",
        a."createdAt"
      FROM "Article" a
      LEFT JOIN "Source" s ON a."sourceId" = s.id
      WHERE LENGTH(a.content) >= 5000
        AND a."detailedSummary" IS NOT NULL
        AND a."detailedSummary" != ''
        AND a."detailedSummary" LIKE '%・%'
        AND LENGTH(a."detailedSummary") - LENGTH(REPLACE(a."detailedSummary", '・', '')) <= 4
      ORDER BY LENGTH(a.content) DESC
    `;

    console.log(`${articles.length}件の問題記事が見つかりました`);

    // CSVファイルのパスを生成（タイムスタンプ付き）
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = join(process.cwd(), `problem_articles_${timestamp}.csv`);

    // CSVヘッダー
    const csvHeader = 'ID,タイトル,URL,ソース,文字数,項目数,要約バージョン,作成日時,問題の深刻度\n';

    // CSVファイルに書き込み
    const stream = createWriteStream(csvPath);
    stream.write('\uFEFF'); // BOM付きでExcelで開けるように
    stream.write(csvHeader);

    for (const article of articles) {
      // 問題の深刻度を判定
      let severity = '低';
      if (article.contentLength >= 10000 && article.itemCount <= 3) {
        severity = '高';
      } else if (article.contentLength >= 8000 && article.itemCount <= 3) {
        severity = '中';
      }

      // CSVの行を作成（全フィールドをエスケープ）
      const row = [
        csvEscape(article.id),
        csvEscape(article.title),
        csvEscape(article.url),
        csvEscape(article.sourceName || 'Unknown'),
        csvEscape(article.contentLength),
        csvEscape(article.itemCount),
        csvEscape(article.summaryVersion || 0),
        csvEscape(article.createdAt.toISOString()),
        csvEscape(severity)
      ].join(',') + '\n';

      stream.write(row);
    }

    // ファイルクローズを待機
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
      stream.end();
    });

    console.log(`\n✅ CSVファイルを作成しました: ${csvPath}`);

    // 統計情報の表示
    const stats = {
      total: articles.length,
      severity_high: articles.filter(a => a.contentLength >= 10000 && a.itemCount <= 3).length,
      severity_medium: articles.filter(a => a.contentLength >= 8000 && a.itemCount <= 3 && a.contentLength < 10000).length,
      severity_low: articles.filter(a => !(a.contentLength >= 8000 && a.itemCount <= 3)).length,
      item1: articles.filter(a => a.itemCount === 1).length,
      item2: articles.filter(a => a.itemCount === 2).length,
      item3: articles.filter(a => a.itemCount === 3).length,
      item4: articles.filter(a => a.itemCount === 4).length,
    };

    console.log('\n📊 統計情報:');
    console.log(`  深刻度「高」: ${stats.severity_high}件`);
    console.log(`  深刻度「中」: ${stats.severity_medium}件`);
    console.log(`  深刻度「低」: ${stats.severity_low}件`);
    console.log('\n項目数の分布:');
    console.log(`  1項目: ${stats.item1}件`);
    console.log(`  2項目: ${stats.item2}件`);
    console.log(`  3項目: ${stats.item3}件`);
    console.log(`  4項目: ${stats.item4}件`);

    // 最も深刻なケースを表示
    const mostSevere = articles
      .filter(a => a.itemCount <= 2)
      .slice(0, 5);

    if (mostSevere.length > 0) {
      console.log('\n⚠️  最も深刻なケース（項目数2以下）:');
      mostSevere.forEach(article => {
        console.log(`  - ${article.title.substring(0, 50)}...`);
        console.log(`    文字数: ${article.contentLength.toLocaleString()}, 項目数: ${article.itemCount}`);
        console.log(`    ID: ${article.id}`);
      });
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプトを実行
exportLowItemSummaries()
  .then(() => {
    console.log('\n✨ エクスポート完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('予期しないエラー:', error);
    process.exit(1);
  });