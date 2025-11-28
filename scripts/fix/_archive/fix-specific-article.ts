#!/usr/bin/env npx tsx
/**
 * 特定の記事の要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../lib/ai/unified-summary-service';

const prisma = new PrismaClient();

async function fixSpecificArticle() {
  const articleId = 'cmeakzizv001ptezrvv5nmw2q';
  
  console.error('========================================');
  console.error('特定記事の要約再生成');
  console.error('========================================\n');

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    include: { source: true }
  });

  if (!article) {
    console.error('記事が見つかりません');
    await prisma.$disconnect();
    return;
  }

  console.error(`記事: ${article.title}`);
  console.error(`現在の要約: ${article.summary}\n`);
  console.error(`問題: 「オープンソースプロジェクト。」という体言止めで終わっている\n`);

  if (!article.content || article.content.length < 100) {
    console.error('コンテンツ不十分');
    await prisma.$disconnect();
    return;
  }

  const service = new UnifiedSummaryService();

  try {
    console.error('要約を再生成中...');
    const result = await service.generate(
      article.title,
      article.content,
      { maxRetries: 3 },
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

    console.error('\n✅ 成功！');
    console.error(`\n新しい要約: ${result.summary}`);
    console.error(`\n文字数: ${result.summary.length}文字`);
    console.error(`Version: ${result.summaryVersion}`);

  } catch (error) {
    console.error('❌ エラー:', error);
  }

  await prisma.$disconnect();
}

// 実行
fixSpecificArticle().catch(async (error) => {
  console.error('Fatal error:', error);
  await prisma.$disconnect();
  process.exit(1);
});