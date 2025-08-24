import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../../lib/ai/gemini';
import { validateSummary, validateDetailedSummary } from '../../lib/utils/summary-validator';

const prisma = new PrismaClient();

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
  console.error('===== 要約再生成スクリプト =====\n');
  
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
    process.exit(1);
  }
  
  const geminiClient = new GeminiClient(geminiApiKey);
  
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
    const whereClause: any = {};
    
    if (options.lastHours) {
      const since = new Date(Date.now() - options.lastHours * 60 * 60 * 1000);
      whereClause.createdAt = { gte: since };
    }
    
    if (!options.force) {
      // 問題のある要約のパターン
      whereClause.OR = [
        { summary: { endsWith: '。詳' } },
        { summary: { endsWith: '詳。' } },
        { summary: { endsWith: 'CL。' } },
        { summary: { endsWith: '分析。' } },
        { summary: { contains: '要約:' } },
        { summary: { contains: '要約：' } },
        { summary: { lt: 50 } }, // 50文字未満
        { detailedSummary: { contains: '記事内のコード例や手順を参照してください' } },
        { detailedSummary: null },
        { detailedSummary: { lt: 200 } } // 詳細要約が200文字未満
      ];
    }
    
    articles = await prisma.article.findMany({
      where: whereClause,
      include: {
        source: true,
        tags: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: options.limit || 50
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
      
      // 要約の検証
      const summaryValidation = validateSummary(result.summary);
      const detailedValidation = validateDetailedSummary(result.detailedSummary);
      
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
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: { increment: 1 }
        }
      });
      
      // タグの更新（必要に応じて）
      if (result.tags.length > 0) {
        // 既存タグとの差分を確認
        const existingTagNames = article.tags.map(t => t.name);
        const newTagNames = result.tags.filter(t => !existingTagNames.includes(t));
        
        if (newTagNames.length > 0) {
          console.error(`  新しいタグ: ${newTagNames.join(', ')}`);
          
          // 新しいタグを作成・接続
          for (const tagName of newTagNames) {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { name: tagName }
            });
            
            await prisma.article.update({
              where: { id: article.id },
              data: {
                tags: {
                  connect: { id: tag.id }
                }
              }
            });
          }
        }
      }
      
      console.error('  ✅ 再生成完了');
      console.error(`  新要約: ${result.summary.substring(0, 50)}...`);
      successCount++;
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
      errors.push({
        id: article.id,
        title: article.title,
        error: error instanceof Error ? error.message : String(error)
      });
      failureCount++;
    }
    
    // API制限対策
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 結果サマリー
  console.error('\n===== 再生成完了 =====');
  console.error(`成功: ${successCount}件`);
  console.error(`失敗: ${failureCount}件`);
  
  if (errors.length > 0) {
    console.error('\n失敗した記事:');
    errors.forEach(e => {
      console.error(`  - ${e.title.substring(0, 50)}... (${e.id})`);
      console.error(`    エラー: ${e.error}`);
    });
  }
  
  await prisma.$disconnect();
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
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { regenerateSummaries };