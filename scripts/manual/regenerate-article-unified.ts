#!/usr/bin/env tsx
import { prisma } from '@/lib/prisma';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { resolveTags } from '@/lib/services/tag-service';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';

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
        // 定期実行の要約生成（batch-processor）と同じ状態を書く。一覧は summaryComputedAt が
        // ある記事だけを出す
        summaryComputedAt: new Date(),
        summaryError: null,
        skipReason: null,
        updatedAt: new Date(),
      },
    });

    console.log('データベースを更新しました');

    // 埋め込みのジョブは、要約を保存した後に積む（ワーカーは保存済みの要約を埋め込む）
    await new EmbeddingScheduler(prisma).enqueue(articleId);

    // タグの更新。失敗しても、保存した要約のキャッシュは消す
    try {
      if (result.tags && result.tags.length > 0) {
        console.log('');
        console.log(`タグ: ${result.tags.join(', ')}`);

        // 大文字小文字だけが違う既存のタグを使う（#672。lower(name) で一意）
        const tagRecords = await resolveTags(
          result.tags.map((name) => ({ name })),
          prisma
        );

        // 使えるタグが無ければ（空白だけの名前など）今のタグを残す
        if (tagRecords.length > 0) {
          await prisma.article.update({
            where: { id: articleId },
            data: {
              tags: {
                set: [],
                connect: tagRecords.map((tag) => ({ id: tag.id })),
              },
            },
          });
        }

        console.log('タグを更新しました');
      }
    } finally {
      // onArticleUpdated は失敗を投げずにログ（"Failed to invalidate cache on article update"）へ出す
      await cacheInvalidator.onArticleUpdated(articleId, {
        summary: result.summary,
        detailedSummary: result.detailedSummary,
      });
      console.log('キャッシュの無効化を実行しました（失敗はログに出ます）');
    }
    console.log('');
    console.log('='.repeat(60));
    console.log('完了');
    console.log('='.repeat(60));
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
