#!/usr/bin/env npx tsx

/**
 * はてなブックマーク経由の外部サイト記事（Speaker Deck、SlideShare等）の処理スクリプト
 * 
 * 目的：
 * - コンテンツが不足している記事を特定
 * - 低品質な要約を持つ記事をリスト化
 * - 必要に応じて削除または再処理
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProblematicArticle {
  id: string;
  title: string;
  url: string;
  contentLength: number;
  speculativeCount: number;
  qualityScore: number;
}

// 推測表現のパターン
const SPECULATIVE_PATTERNS = [
  'と考えられます',
  'と考えられる',
  'と推測されます',
  'と推測される',
  'かもしれません',
  'かもしれない',
  'と思われます',
  'と思われる',
  'ようです',
  'でしょう',
  'だろう',
  '可能性が高い',
  '可能性があります'
];

/**
 * 推測表現をカウント
 */
function countSpeculativeExpressions(text: string): number {
  if (!text) return 0;
  
  let count = 0;
  for (const pattern of SPECULATIVE_PATTERNS) {
    const regex = new RegExp(pattern, 'g');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

async function main() {
  console.log('=== はてなブックマーク経由外部記事の分析 ===\n');

  try {
    // はてなブックマークソースのIDを取得
    const hatenaSource = await prisma.source.findFirst({
      where: { name: 'はてなブックマーク' }
    });

    if (!hatenaSource) {
      console.error('はてなブックマークソースが見つかりません');
      return;
    }

    // 対象記事を取得（Speaker Deck、SlideShare等でコンテンツが短い記事）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: hatenaSource.id,
        OR: [
          { url: { contains: 'speakerdeck.com' } },
          { url: { contains: 'slideshare.net' } }
        ]
      },
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
        detailedSummary: true,
        qualityScore: true,
        publishedAt: true
      }
    });

    console.log(`対象記事数: ${articles.length}件\n`);

    const problematicArticles: ProblematicArticle[] = [];

    // 各記事を分析
    for (const article of articles) {
      const contentLength = article.content?.length || 0;
      const speculativeCount = countSpeculativeExpressions(article.detailedSummary || '');
      
      // コンテンツが短く、推測表現が多い記事を問題記事として記録
      if (contentLength < 300 || speculativeCount >= 3) {
        problematicArticles.push({
          id: article.id,
          title: article.title,
          url: article.url,
          contentLength,
          speculativeCount,
          qualityScore: article.qualityScore
        });
      }
    }

    // 結果をレポート
    console.log('=== 分析結果 ===\n');
    console.log(`問題のある記事: ${problematicArticles.length}件\n`);

    if (problematicArticles.length > 0) {
      console.log('詳細：');
      console.log('---');
      
      for (const article of problematicArticles) {
        console.log(`\nID: ${article.id}`);
        console.log(`タイトル: ${article.title}`);
        console.log(`URL: ${article.url}`);
        console.log(`コンテンツ長: ${article.contentLength}文字`);
        console.log(`推測表現数: ${article.speculativeCount}個`);
        console.log(`品質スコア: ${article.qualityScore}`);
        console.log('---');
      }

      // 処理オプションを表示
      console.log('\n=== 推奨アクション ===\n');
      console.log('1. これらの記事の要約を再生成する場合:');
      console.log('   npx tsx scripts/manual/regenerate-single-article.ts [記事ID]');
      console.log('\n2. これらの記事を削除する場合:');
      console.log('   以下のSQLを実行:');
      
      const idsToDelete = problematicArticles.map(a => `'${a.id}'`).join(', ');
      console.log(`   DELETE FROM Article WHERE id IN (${idsToDelete});`);
      
      console.log('\n3. 今後の要約生成をスキップするため、generate-summaries.tsの修正が必要です');
      
      // CSVエクスポート
      const csvPath = 'problematic-hatena-articles.csv';
      const csv = [
        'id,title,url,content_length,speculative_count,quality_score',
        ...problematicArticles.map(a => 
          `"${a.id}","${a.title}","${a.url}",${a.contentLength},${a.speculativeCount},${a.qualityScore}`
        )
      ].join('\n');
      
      const fs = await import('fs');
      await fs.promises.writeFile(csvPath, csv, 'utf-8');
      console.log(`\n結果をCSVファイルに保存しました: ${csvPath}`);
    }

  } catch (error) {
    console.error('エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);