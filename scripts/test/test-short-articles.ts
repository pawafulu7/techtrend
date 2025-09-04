#!/usr/bin/env npx tsx
/**
 * 500文字以下の記事で詳細要約スキップ機能をテスト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

// テスト用の記事ID（500文字以下でサムネイルがある記事）
const TEST_ARTICLES = [
  'cmea3mpxi000ate5q70n4xht9', // 338文字 - "Meme Monday"
  'cmea1hzq50001tea95m9ks51u', // 300文字 - TypeScript interface配列
  'cme9x7tt4000iterfxgwq1tf8', // 300文字 - ページ離脱時アラート
];

async function testShortArticles() {
  console.error('========================================');
  console.error('500文字以下の記事テスト');
  console.error('========================================\n');

  for (const articleId of TEST_ARTICLES) {
    try {
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          title: true,
          content: true,
          url: true,
          sourceId: true,
          thumbnail: true,
          detailedSummary: true,
          summary: true,
        }
      });

      if (!article) {
        console.error(`❌ 記事が見つかりません: ${articleId}`);
        continue;
      }

      console.error(`\n【記事情報】`);
      console.error(`ID: ${article.id}`);
      console.error(`タイトル: ${article.title}`);
      console.error(`文字数: ${article.content?.length || 0}文字`);
      console.error(`サムネイル: ${article.thumbnail ? '有り' : '無し'}`);
      console.error(`現在の詳細要約: ${article.detailedSummary?.substring(0, 50)}...`);

      // 新しい要約生成をテスト（実際にはDBは更新しない）
      console.error('\n新しい要約生成をテスト中...');
      
      const service = new UnifiedSummaryService();
      const result = await service.generate(
        article.title,
        article.content || '',
        undefined,
        { sourceName: article.sourceId, url: article.url }
      );

      console.error(`✅ 生成完了`);
      console.error(`  一覧要約: ${result.summary.length}文字`);
      console.error(`  詳細要約: ${result.detailedSummary}`);
      console.error(`  詳細要約スキップ: ${result.detailedSummary === '__SKIP_DETAILED_SUMMARY__' ? 'はい' : 'いいえ'}`);

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
      console.error(`❌ エラー: ${articleId}`, error);
    }
  }

  // 統計情報
  console.error('\n========================================');
  console.error('500文字以下の記事の統計');
  console.error('========================================\n');

  const shortArticles = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN thumbnail IS NOT NULL THEN 1 END) as with_thumbnail,
      COUNT(CASE WHEN detailedSummary = '__SKIP_DETAILED_SUMMARY__' THEN 1 END) as skipped
    FROM Article
    WHERE LENGTH(content) <= 500
  `;

  const stats = shortArticles[0];
  const total = Number(stats.total);
  const withThumbnail = Number(stats.with_thumbnail);
  const skipped = Number(stats.skipped);
  
  console.error(`総数: ${total}記事`);
  console.error(`サムネイル有り: ${withThumbnail}記事（${Math.round(withThumbnail / total * 100)}%）`);
  console.error(`詳細要約スキップ済み: ${skipped}記事`);

  await prisma.$disconnect();
}

// 実行
testShortArticles();