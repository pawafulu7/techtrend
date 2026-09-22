#!/usr/bin/env tsx
/**
 * Gemini Flex tier 段階導入 Step A 用の動作確認スクリプト。
 *
 * lib/di/bootstrap.ts 経由のDIパス（今回Flex対応した経路）を実際に通す。
 * scripts/manual/regenerate-*.ts 系は lib/ai/unified-summary-service.ts(legacy、
 * node-fetch直書き)を使っており、Flex tierのコードパスを一切通らないため使えない。
 *
 * 使い方:
 *   npx tsx scripts/manual/verify-flex-tier.ts <articleId> [articleId...]
 *
 * DBを変更しない（要約結果は保存せず、標準出力に表示するのみ）。
 */
import { prisma } from '@/lib/prisma';
import { buildAppDependencies } from '@/lib/di/bootstrap';

async function main() {
  const articleIds = process.argv.slice(2);
  if (articleIds.length === 0) {
    console.error(
      'Usage: npx tsx scripts/manual/verify-flex-tier.ts <articleId> [articleId...]'
    );
    process.exit(1);
  }

  // GEMINI_SUMMARY_SERVICE_TIER環境変数の設定有無に関わらず、このスクリプトの実行中は
  // 強制的にFlex tierを使う(段階導入Step Aの動作確認が目的のため)
  const { service } = buildAppDependencies({
    gemini: { summaryServiceTier: 'flex' },
  });

  for (const articleId of articleIds) {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      console.error(`記事が見つかりません: ${articleId}`);
      continue;
    }
    if (!article.content) {
      console.error(`コンテンツが保存されていません: ${articleId}`);
      continue;
    }

    console.log('='.repeat(60));
    console.log(`記事ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);

    const startedAt = Date.now();
    try {
      const result = await service.generateSummary({
        title: article.title,
        content: article.content,
        articleId: article.id,
      });
      const elapsedMs = Date.now() - startedAt;

      console.log(`所要時間: ${elapsedMs}ms`);
      console.log(`一覧要約: ${result.summary}`);
      console.log(`詳細要約: ${result.detailedSummary?.slice(0, 100)}...`);
      console.log(
        '※ どちらのtierで成功したか(flex/standardフォールバック有無)は' +
          'ログ出力(logger.info "Summary generation tier result")を確認してください'
      );
    } catch (error) {
      console.error(
        `要約生成に失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
