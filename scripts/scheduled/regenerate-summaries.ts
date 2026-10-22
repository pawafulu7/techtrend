import { prisma } from '@/lib/prisma';
import { Prisma } from '@/lib/prisma-exports';
import { GeminiClient } from '../../lib/ai/gemini';
import { validateSummary, validateDetailedSummary } from '../../lib/utils/summary/summary-validator';
import { postProcessSummaries } from '../../lib/utils/summary/summary-post-processor';
import { reportResults, rateLimitDelay } from './utils/regeneration-helpers';
import { env } from '@/lib/config/env';
import { resolveTags } from '@/lib/services/tag-service';
import { summarizeError } from '@/lib/utils/sanitize-error';
import { EmbeddingScheduler } from '@/lib/services/embedding-scheduler';
import { cacheInvalidator } from '@/lib/cache/cache-invalidator';
import { closeRedisConnection } from '@/lib/redis/client';
import { SUMMARY_VERSION } from '@/types/article';

interface RegenerationOptions {
  articleIds?: string[];
  lastHours?: number;
  force?: boolean;
  limit?: number;
}

/**
 * 問題のある要約を持つ記事を再生成
 */
async function regenerateSummaries(options: RegenerationOptions = {}) {
  try {
  console.error('===== 要約再生成スクリプト =====\n');

  const geminiApiKey = env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
    process.exit(1);
  }

  const geminiClient = new GeminiClient(geminiApiKey);
  const embeddingScheduler = new EmbeddingScheduler(prisma);

  // 対象記事の取得
  let articles;
  
  if (options.articleIds && options.articleIds.length > 0) {
    // 特定の記事IDを指定
    console.error(`指定された記事ID: ${options.articleIds.join(', ')}`);
    articles = await prisma.article.findMany({
      where: {
        id: { in: options.articleIds }
      },
      include: {
        source: true,
        tags: true
      }
    });
  } else {
    // 問題のある要約を持つ記事を検索
    const whereClause: Prisma.ArticleWhereInput = {};
    const take = options.limit && options.limit > 0 ? options.limit : 50;
    const since = options.lastHours
      ? new Date(Date.now() - options.lastHours * 60 * 60 * 1000)
      : null;

    if (since) {
      whereClause.createdAt = { gte: since };
    }

    if (!options.force) {
      // このスクリプトは統一プロンプト（V8）で作るので、今の版の要約は対象にしない（版を下げてしまう）。
      // 要約の無い記事（NULL・空文字）は定期の要約生成が作る
      whereClause.summary = { not: null, notIn: [''] };
      whereClause.summaryVersion = { lt: SUMMARY_VERSION.CURRENT };

      // 文字数の条件は Prisma の where では書けない（文字列の lt に数値を渡すと検証エラーで落ちる）。
      // 該当する記事の ID を SQL で取って OR に加える。下の取得と同じ条件・同じ並びで take 件までに
      // 絞っても、取得の結果は変わらない
      const tooShort = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Article"
        WHERE (char_length(summary) < 50 OR char_length("detailedSummary") < 200)
          AND COALESCE(summary, '') <> ''
          AND "summaryVersion" < ${SUMMARY_VERSION.CURRENT}
          ${since ? Prisma.sql`AND "createdAt" >= ${since.toISOString()}::timestamptz` : Prisma.empty}
        ORDER BY "createdAt" DESC, id DESC
        LIMIT ${take}
      `;

      // 問題のある要約のパターン
      whereClause.OR = [
        // quality-check.ts が再生成の印として版を 0 に戻した記事
        { summaryVersion: 0 },
        { summary: { endsWith: '。詳' } },
        { summary: { endsWith: '詳。' } },
        { summary: { endsWith: 'CL。' } },
        { summary: { endsWith: '分析。' } },
        { summary: { contains: '要約:' } },
        { summary: { contains: '要約：' } },
        { detailedSummary: { contains: '記事内のコード例や手順を参照してください' } },
        { detailedSummary: null },
        // 要約が50文字未満、または詳細要約が200文字未満
        { id: { in: tooShort.map((row) => row.id) } }
      ];
    }

    articles = await prisma.article.findMany({
      where: whereClause,
      include: {
        source: true,
        tags: true
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take
    });
  }
  
  console.error(`対象記事数: ${articles.length}件\n`);
  
  if (articles.length === 0) {
    console.error('✅ 再生成が必要な記事はありません');
    return;
  }
  
  // 統計情報
  let successCount = 0;
  let failureCount = 0;
  const errors: Array<{ id: string; title: string; error: string }> = [];
  
  // 各記事の要約を再生成
  for (const article of articles) {
    console.error(`\n処理中: ${article.title.substring(0, 50)}...`);
    console.error(`  ID: ${article.id}`);
    console.error(`  ソース: ${article.source.name}`);
    console.error(`  現在の要約: ${article.summary?.substring(0, 50)}...`);
    
    try {
      // コンテンツの確認
      const content = article.content || article.summary || '';
      
      if (content.length < 50) {
        console.warn('  ⚠️ コンテンツが短すぎるためスキップ');
        continue;
      }
      
      // 要約の再生成
      const result = await geminiClient.generateDetailedSummary(
        article.title,
        content
      );

      const processed = postProcessSummaries(result.summary, result.detailedSummary);

      // 要約の検証
      const summaryValidation = validateSummary(processed.summary);
      const detailedValidation = validateDetailedSummary(processed.detailedSummary);
      
      if (!summaryValidation.isValid) {
        console.warn('  ⚠️ 生成された要約に問題があります:', summaryValidation.errors);
      }
      
      if (!detailedValidation.isValid) {
        console.warn('  ⚠️ 生成された詳細要約に問題があります:', detailedValidation.errors);
      }
      
      // データベース更新
      await prisma.article.update({
        where: { id: article.id },
        data: {
          summary: processed.summary,
          detailedSummary: processed.detailedSummary,
          // generateDetailedSummary は統一プロンプト（generateUnifiedPrompt）で作るので、その版を保存する
          summaryVersion: SUMMARY_VERSION.V8,
          // 定期実行の要約生成（batch-processor）と同じ状態を書く。一覧は summaryComputedAt が
          // ある記事だけを出す
          summaryComputedAt: new Date(),
          summaryError: null,
          skipReason: null
        }
      });
      // 埋め込みのジョブは、要約を保存した後に積む（ワーカーは保存済みの要約を埋め込む）
      await embeddingScheduler.enqueue(article.id);

      // タグの更新（必要に応じて）。失敗しても、保存した要約のキャッシュは消す
      try {
        if (result.tags.length > 0) {
          // 大文字小文字だけが違う既存のタグがあればそれを使う（#672）。
          // 既存タグとの差分は ID と表記の小文字で比べる（表記違いの重複タグが別の ID で
          // 残っている間に、同じタグを二重に付けないため）
          const tags = await resolveTags(result.tags.map(name => ({ name })));
          const existingTagIds = new Set(article.tags.map(t => t.id));
          const existingTagKeys = new Set(article.tags.map(t => t.name.toLowerCase()));
          const newTags = tags.filter(
            tag =>
              !existingTagIds.has(tag.id) && !existingTagKeys.has(tag.name.toLowerCase())
          );

          if (newTags.length > 0) {
            console.error(`  新しいタグ: ${newTags.map(tag => tag.name).join(', ')}`);

            await prisma.article.update({
              where: { id: article.id },
              data: {
                tags: {
                  connect: newTags.map(tag => ({ id: tag.id }))
                }
              }
            });
          }
        }
      } finally {
        // タグまで書いてからキャッシュを消す（先に消すと、タグを書く前の状態がまたキャッシュされる）
        await cacheInvalidator.onArticleUpdated(article.id, {
          summary: processed.summary,
          detailedSummary: processed.detailedSummary,
        });
      }

      console.error('  ✅ 再生成完了');
      console.error(`  新要約: ${processed.summary.substring(0, 50)}...`);
      successCount++;
      
    } catch (error) {
      console.error(`  ❌ エラー: ${summarizeError(error)}`);
      errors.push({
        id: article.id,
        title: article.title,
        error: summarizeError(error)
      });
      failureCount++;
    }
    
    // API制限対策
    await rateLimitDelay(2000);
  }
  
  // 結果サマリー
  reportResults('再生成完了', { success: successCount, failed: failureCount });
  
  if (errors.length > 0) {
    console.error('\n失敗した記事:');
    errors.forEach(e => {
      console.error(`  - ${e.title.substring(0, 50)}... (${e.id})`);
      console.error(`    エラー: ${e.error}`);
    });
  }
  
  } finally {
    try {
      await prisma.$disconnect();
    } finally {
      // キャッシュのモジュールが読み込んだ時点で Redis に接続しているので、閉じないとプロセスが終わらない
      await closeRedisConnection();
    }
  }
}

// コマンドライン引数の処理
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: RegenerationOptions = {};
  
  // --ids オプション
  const idsIndex = args.indexOf('--ids');
  if (idsIndex !== -1 && args[idsIndex + 1]) {
    options.articleIds = args[idsIndex + 1].split(',');
  }
  
  // --last-hours オプション
  const hoursIndex = args.indexOf('--last-hours');
  if (hoursIndex !== -1 && args[hoursIndex + 1]) {
    options.lastHours = parseInt(args[hoursIndex + 1]);
  }
  
  // --force オプション
  if (args.includes('--force')) {
    options.force = true;
  }
  
  // --limit オプション
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1]);
  }
  
  // ヘルプ表示
  if (args.includes('--help')) {
    console.error(`
使用方法:
  npx tsx scripts/scheduled/regenerate-summaries.ts [オプション]

オプション:
  --ids <id1,id2,...>  特定の記事IDを指定（カンマ区切り）
  --last-hours <n>      過去n時間以内の記事を対象
  --force               問題の有無に関わらずすべて再生成
  --limit <n>           処理する記事数の上限（デフォルト: 50）
  --help                このヘルプを表示

例:
  # 特定の記事を再生成
  npx tsx scripts/scheduled/regenerate-summaries.ts --ids cme2ydmib000itenunno1f5j8,cme2u2yss0007te7fdrz9ynvk
  
  # 過去24時間の問題記事を再生成
  npx tsx scripts/scheduled/regenerate-summaries.ts --last-hours 24
  
  # すべての記事を強制再生成（最大20件）
  npx tsx scripts/scheduled/regenerate-summaries.ts --force --limit 20
    `);
    process.exit(0);
  }
  
  regenerateSummaries(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', summarizeError(error, { stack: true }));
      process.exit(1);
    });
}

export { regenerateSummaries };
