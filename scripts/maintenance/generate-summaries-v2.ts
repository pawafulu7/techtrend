#!/usr/bin/env npx tsx

/**
 * 記事要約生成バッチ処理（統一サービス版）
 * 英語タイトル翻訳機能付き
 *
 * 使用方法:
 * npx tsx scripts/maintenance/generate-summaries-v2.ts
 * npx tsx scripts/maintenance/generate-summaries-v2.ts --limit 10
 * npx tsx scripts/maintenance/generate-summaries-v2.ts --source "Hugging Face Papers"
 */

import { PrismaClient } from '@prisma/client';
import { getAppDependencies } from '@/lib/di/bootstrap';
import { SUMMARY_VERSION } from '@/types/article';

const prisma = new PrismaClient();

interface GenerationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: string[];
}

async function generateSummariesForArticles(
  limit: number = 100,
  sourceName?: string
): Promise<GenerationResult> {
  const result: GenerationResult = {
    success: true,
    processed: 0,
    failed: 0,
    errors: [],
  };

  try {
    // DIコンテナの初期化
    const { service } = getAppDependencies();

    console.log('=== 要約生成処理開始 ===');
    console.log(`開始時刻: ${new Date().toISOString()}`);

    // 要約が未生成の記事を取得
    const whereCondition: any = {
      OR: [
        { summary: null },
        { summary: '' },
        { detailedSummary: null },
        { detailedSummary: '' },
        { summaryVersion: { lt: SUMMARY_VERSION.UNIFIED } },
      ],
    };

    if (sourceName) {
      whereCondition.source = { name: sourceName };
    }

    const articles = await prisma.article.findMany({
      where: whereCondition,
      include: {
        source: true,
      },
      take: limit,
      orderBy: {
        publishedAt: 'desc',
      },
    });

    console.log(`処理対象記事数: ${articles.length}件`);

    for (const article of articles) {
      try {
        console.log(`\n処理中: [${article.source.name}] ${article.title.substring(0, 50)}...`);

        // 記事本文が保存されているか確認
        if (!article.content) {
          console.warn('  ⚠️ 記事本文が保存されていません。スキップします。');
          continue;
        }

        const content = article.content;

        // 要約生成
        const summaryResult = await service.generateSummary({
          title: article.title,
          content,
          articleType: article.articleType as any,
        });

        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: summaryResult.summary,
            detailedSummary: summaryResult.detailedSummary,
            translatedTitle: summaryResult.translatedTitle,
            summaryVersion: SUMMARY_VERSION.UNIFIED,
            articleType: 'unified',
            summaryComputedAt: new Date(),
          },
        });

        // タグの処理
        if (summaryResult.tags && summaryResult.tags.length > 0) {
          // タグを作成または取得
          const tagRecords = await Promise.all(
            summaryResult.tags.map(async (tagName) => {
              return prisma.tag.upsert({
                where: { name: tagName },
                update: {},
                create: { name: tagName },
              });
            })
          );

          // 記事にタグを関連付ける
          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: tagRecords.map((tag) => ({ id: tag.id })),
              },
            },
          });
        }

        result.processed++;

        // 翻訳タイトルのログ出力
        if (summaryResult.translatedTitle) {
          console.log(`  ✅ 要約生成成功（翻訳タイトル: ${summaryResult.translatedTitle.substring(0, 30)}...）`);
        } else {
          console.log(`  ✅ 要約生成成功（日本語タイトル）`);
        }
        console.log(`  📊 品質スコア: ${summaryResult.qualityScore}`);

        // Rate limit対策
        await new Promise((resolve) => setTimeout(resolve, 3000));

      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push(`${article.id}: ${errorMessage}`);
        console.error(`  ❌ エラー: ${errorMessage}`);

        // Rate limitエラーの場合は長めに待機
        if (errorMessage.includes('429') || errorMessage.includes('rate')) {
          console.log('  ⏳ Rate limit検出。30秒待機...');
          await new Promise((resolve) => setTimeout(resolve, 30000));
        }
      }
    }

    // 結果サマリー
    console.log('\n=== 処理完了 ===');
    console.log(`終了時刻: ${new Date().toISOString()}`);
    console.log(`処理済み: ${result.processed}件`);
    console.log(`失敗: ${result.failed}件`);

    if (result.errors.length > 0) {
      console.log('\n=== エラー詳細 ===');
      result.errors.forEach((error) => console.error(error));
    }

  } catch (error) {
    console.error('致命的エラー:', error);
    result.success = false;
  } finally {
    await prisma.$disconnect();
  }

  return result;
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  let limit = 100;
  let sourceName: string | undefined;

  // 引数解析
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      if (isNaN(limit) || limit <= 0) {
        console.error('エラー: --limit には正の整数を指定してください');
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--source' && args[i + 1]) {
      sourceName = args[i + 1];
      i++;
    }
  }

  const result = await generateSummariesForArticles(limit, sourceName);
  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
}