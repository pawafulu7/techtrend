#!/usr/bin/env tsx
import { prisma } from '@/lib/prisma';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';

async function regenerateArticleUnified(articleId: string) {
  console.log('='.repeat(60));
  console.log('記事要約再生成（統一要約サービス使用）');
  console.log('='.repeat(60));
  console.log('');

  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true },
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      return;
    }

    console.log(`記事ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`ソース: ${article.source.name}`);
    console.log('');

    console.log('--- 現在の要約 ---');
    console.log(`一覧要約: ${article.summary}`);
    console.log(`文字数: ${article.summary?.length || 0}文字`);
    console.log('');

    if (!article.content) {
      console.error('コンテンツが保存されていません');
      return;
    }

    console.log(`コンテンツ文字数: ${article.content.length}文字`);
    console.log('');

    console.log('--- 要約を再生成中... ---');
    const service = getUnifiedSummaryService();

    const result = await service.generate(article.title, article.content, {
      maxRetries: 3,
      minQualityScore: 40,
    });

    console.log('');
    console.log('--- 新しい要約 ---');
    console.log(`一覧要約: ${result.summary}`);
    console.log(`文字数: ${result.summary.length}文字`);
    console.log(`品質スコア: ${result.qualityScore}`);
    console.log('');
    console.log(`詳細要約:
${result.detailedSummary}`);
    console.log(`文字数: ${result.detailedSummary.length}文字`);
    console.log('');

    await prisma.article.update({
      where: { id: articleId },
      data: {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
        summaryVersion: result.summaryVersion,
        updatedAt: new Date(),
      },
    });

    console.log('データベースを更新しました');

    if (result.tags && result.tags.length > 0) {
      console.log('');
      console.log(`タグ: ${result.tags.join(', ')}`);

      const tagRecords = await Promise.all(
        result.tags.map(async (tagName) => {
          return await prisma.tag.upsert({
            where: { name: tagName },
            create: { name: tagName },
            update: {},
          });
        })
      );

      await prisma.article.update({
        where: { id: articleId },
        data: {
          tags: {
            set: [],
            connect: tagRecords.map((tag) => ({ id: tag.id })),
          },
        },
      });

      console.log('タグを更新しました');
    }

    let cacheInvalidationFailed = false;
    try {
      await cacheInvalidator.invalidateArticle(articleId);
      console.log('キャッシュを無効化しました');
    } catch (cacheError) {
      cacheInvalidationFailed = true;
      console.error('');
      console.error('警告: キャッシュ無効化に失敗しました');
      console.error('記事ID:', articleId);
      console.error('エラー:', cacheError instanceof Error ? cacheError.message : String(cacheError));
      if (cacheError instanceof Error && cacheError.stack) {
        console.error('スタックトレース:', cacheError.stack);
      }
      console.error('');
      console.error('手動対応が必要:');
      console.error('  1. Redisサービスが起動しているか確認: docker ps | grep redis');
      console.error('  2. 手動でキャッシュをクリア: docker exec techtrend-redis redis-cli FLUSHALL');
      console.error('  3. または、アプリケーション再起動でキャッシュを更新');
    }
    console.log('');
    console.log('='.repeat(60));
    if (cacheInvalidationFailed) {
      console.log('完了（警告: キャッシュ無効化に失敗）');
      console.log('='.repeat(60));
      process.exitCode = 1;
    } else {
      console.log('完了');
      console.log('='.repeat(60));
    }
  } catch (error) {
    console.error('エラー:', error);
    throw error;
  }
}

if (require.main === module) {
  const articleId = process.argv[2];

  if (!articleId) {
    console.error('使用方法: npx tsx scripts/manual/regenerate-article-unified.ts <記事ID>');
    console.error('例: npx tsx scripts/manual/regenerate-article-unified.ts cmgrix7i5000ftedeev1b8nr0');
    process.exit(1);
  }

  regenerateArticleUnified(articleId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { regenerateArticleUnified };
