#!/usr/bin/env npx tsx
/**
 * Version 7移行の小規模テスト
 * コンテンツが更新された記事から数件だけテスト
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function testV7Migration() {
  console.error('========================================');
  console.error('Version 7 移行テスト');
  console.error('========================================\n');

  const service = new UnifiedSummaryService();

  // コンテンツが更新された記事を3件取得（Zenn, Publickey, Hugging Face）
  const testArticles = await prisma.article.findMany({
    where: {
      summaryVersion: { lte: 6 },
      content: { not: null },
      sourceId: {
        in: await prisma.source.findMany({
          where: { name: { in: ['Zenn', 'Publickey', 'Hugging Face Blog'] } },
          select: { id: true }
        }).then(sources => sources.map(s => s.id))
      }
    },
    take: 3,
    orderBy: { publishedAt: 'desc' },
    include: { source: true }
  });

  console.error(`テスト対象: ${testArticles.length}件\n`);

  for (const article of testArticles) {
    console.error(`\n処理中: ${article.title.substring(0, 50)}...`);
    console.error(`  ソース: ${article.source.name}`);
    console.error(`  コンテンツ: ${article.content?.length || 0}文字`);
    console.error(`  現在のVersion: ${article.summaryVersion}`);

    if (!article.content || article.content.length < 100) {
      console.error('  ⚠️ コンテンツが不十分 - スキップ');
      continue;
    }

    try {
      console.error('  要約生成中...');
      const result = await service.generate(
        article.title,
        article.content,
        { maxRetries: 1 },
        { sourceName: article.source.name, url: article.url }
      );

      console.error(`  ✅ 生成成功`);
      console.error(`    一覧要約: ${result.summary.length}文字`);
      console.error(`    詳細要約: ${result.detailedSummary.length}文字`);
      console.error(`    タグ: ${result.tags.join(', ')}`);
      console.error(`    Version: ${result.summaryVersion}`);

      // 実際にDBを更新（テストなので1件だけ）
      if (testArticles.indexOf(article) === 0) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: result.summaryVersion,
            articleType: result.articleType,
            qualityScore: result.qualityScore || 0
          }
        });
        console.error('  ✅ データベース更新完了');
      }

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
      console.error(`  ❌ エラー: ${error}`);
    }
  }

  // 更新後の確認
  console.error('\n========================================');
  console.error('Version 7の記事数確認');
  console.error('========================================\n');

  const v7Count = await prisma.article.count({
    where: { summaryVersion: 7 }
  });

  console.error(`Version 7の記事数: ${v7Count}件`);

  await prisma.$disconnect();
}

// 実行
testV7Migration();