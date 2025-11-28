#!/usr/bin/env npx tsx
/**
 * 体言止めで終わっている要約を修正
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function fixNounEndings() {
  console.error('========================================');
  console.error('体言止め要約の修正');
  console.error('========================================\n');

  // 体言止めで終わっている記事を特定
  const problematicArticles = await prisma.article.findMany({
    where: {
      summaryVersion: 7,
      OR: [
        { summary: { endsWith: 'プロジェクト。' } },
        { summary: { endsWith: 'システム。' } },
        { summary: { endsWith: 'ツール。' } },
        { summary: { endsWith: 'サービス。' } },
        { summary: { endsWith: 'フレームワーク。' } },
        { summary: { endsWith: 'ライブラリ。' } },
        { summary: { endsWith: 'プラットフォーム。' } }
      ],
      AND: [
        { NOT: { summary: { contains: 'である。' } } },
        { NOT: { summary: { contains: 'した。' } } },
        { NOT: { summary: { contains: 'する。' } } },
        { NOT: { summary: { contains: 'れる。' } } },
        { NOT: { summary: { contains: 'いる。' } } }
      ]
    },
    include: { source: true }
  });

  console.error(`体言止めの記事: ${problematicArticles.length}件\n`);

  if (problematicArticles.length === 0) {
    console.error('修正が必要な記事はありません。');
    await prisma.$disconnect();
    return;
  }

  const service = new UnifiedSummaryService();
  let successCount = 0;
  let errorCount = 0;

  for (const article of problematicArticles) {
    console.error(`\n処理中: ${article.title}`);
    console.error(`  現在の要約末尾: ...${article.summary.slice(-30)}`);
    
    if (!article.content || article.content.length < 100) {
      console.error('  ⚠️ コンテンツ不十分 - スキップ');
      continue;
    }

    try {
      // 要約を再生成
      const result = await service.generate(
        article.title,
        article.content,
        { maxRetries: 2 },
        { sourceName: article.source.name, url: article.url }
      );

      // タグの処理
      const existingTags = await prisma.tag.findMany({
        where: { name: { in: result.tags } }
      });
      
      const existingTagNames = existingTags.map(t => t.name);
      const newTagNames = result.tags.filter(t => !existingTagNames.includes(t));
      
      for (const tagName of newTagNames) {
        await prisma.tag.create({
          data: { name: tagName }
        });
      }

      // 記事を更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: result.summaryVersion,
          articleType: result.articleType,
          qualityScore: result.qualityScore || 0,
          tags: {
            set: result.tags.map(name => ({ name }))
          }
        }
      });

      console.error(`  ✅ 成功`);
      console.error(`  新しい要約末尾: ...${result.summary.slice(-30)}`);
      successCount++;

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : error}`);
      errorCount++;
    }
  }

  console.error('\n========================================');
  console.error('修正完了');
  console.error('========================================');
  console.error(`成功: ${successCount}件`);
  console.error(`エラー: ${errorCount}件`);

  await prisma.$disconnect();
}

// 実行
fixNounEndings().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});