/**
 * エンリッチメント済み記事の要約再生成統合スクリプト
 * 複数ソースの記事を一括で再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

// 対象ソース（エンリッチメント対応済み）
const ENRICHED_SOURCES = [
  'Stack Overflow Blog',
  'Corporate Tech Blog',
  'Google Developers Blog',
  'Cloudflare Blog',
  'GitHub Blog',
  'Hacker News',
  'Medium Engineering',
  'Mozilla Hacks',
  'Zenn',
  'Hatena'
];

interface RegenerationOptions {
  sources?: string[];      // 対象ソース（未指定で全て）
  limit?: number;          // 処理件数上限
  dryRun?: boolean;        // 実行せずに対象確認のみ
  force?: boolean;         // 最新版も再生成
  testMode?: boolean;      // 最初の5件のみ処理
  continueFrom?: string;   // 中断箇所から再開（記事ID）
  verbose?: boolean;       // 詳細出力
}

interface SourceStats {
  name: string;
  totalArticles: number;
  enrichedArticles: number;
  targetArticles: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

// 進捗状態を保存するファイル
const PROGRESS_FILE = '.regeneration-progress.json';

async function main() {
  const args = process.argv.slice(2);
  
  // ヘルプフラグの確認
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  // オプションの解析
  const options: RegenerationOptions = {
    sources: undefined,
    limit: undefined,
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    testMode: args.includes('--test-mode'),
    continueFrom: undefined,
    verbose: args.includes('--verbose'),
  };
  
  // sourcesの解析（複数指定対応）
  const sourcesIndex = args.findIndex(arg => arg === '--sources');
  if (sourcesIndex !== -1) {
    const sources: string[] = [];
    let i = sourcesIndex + 1;
    while (i < args.length && !args[i].startsWith('--')) {
      sources.push(args[i]);
      i++;
    }
    if (sources.length > 0) {
      options.sources = sources;
    }
  }
  
  // limitの解析
  const limitIndex = args.findIndex(arg => arg === '--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }
  
  // continue-fromの解析
  const continueIndex = args.findIndex(arg => arg === '--continue-from');
  if (continueIndex !== -1 && args[continueIndex + 1]) {
    options.continueFrom = args[continueIndex + 1];
  }

  await regenerateEnrichedSummaries(options);
}

function showHelp() {
  console.log(`
使用方法:
  npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts [オプション]

オプション:
  --sources <source1> <source2>  対象ソース（複数指定可）
  --limit <number>               処理件数上限
  --dry-run                      実行せずに対象記事を確認
  --force                        最新版（summaryVersion=8）も再生成
  --test-mode                    各ソース最初の5件のみ処理
  --continue-from <id>           指定記事IDから再開
  --verbose                      詳細出力
  --help                         このヘルプを表示

対象ソース:
  ${ENRICHED_SOURCES.join(', ')}

例:
  # Stack Overflow Blogのみ再生成
  npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --sources "Stack Overflow Blog"
  
  # テストモード（各ソース5件ずつ）
  npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --test-mode
  
  # ドライラン（対象確認のみ）
  npx tsx scripts/maintenance/regenerate-all-enriched-summaries.ts --dry-run
  `);
}

async function regenerateEnrichedSummaries(options: RegenerationOptions) {
  console.log('=== エンリッチメント済み記事の要約再生成 ===');
  console.log('開始時刻:', new Date().toLocaleString('ja-JP'));
  
  const startTime = Date.now();
  
  try {
    // 対象ソースの決定
    const targetSources = options.sources || ENRICHED_SOURCES;
    console.log(`\n対象ソース: ${targetSources.length}個`);
    targetSources.forEach(s => console.log(`  - ${s}`));
    
    // 統計情報の初期化
    const stats: Map<string, SourceStats> = new Map();
    
    // 各ソースの統計情報を取得
    for (const sourceName of targetSources) {
      const sourceStats = await getSourceStatistics(sourceName, options);
      stats.set(sourceName, sourceStats);
    }
    
    // ドライランの場合は統計表示のみ
    if (options.dryRun) {
      console.log('\n=== ドライラン: 対象記事の確認 ===');
      displayStatistics(stats);
      return;
    }
    
    // 実際の処理
    console.log('\n=== 要約再生成開始 ===');
    
    for (const sourceName of targetSources) {
      const stat = stats.get(sourceName)!;
      if (stat.targetArticles === 0) {
        console.log(`\n[${sourceName}] 対象記事なし、スキップ`);
        continue;
      }
      
      console.log(`\n[${sourceName}] 処理開始: ${stat.targetArticles}件`);
      await processSource(sourceName, stat, options);
      
      // ソース間で長めの待機
      if (targetSources.indexOf(sourceName) < targetSources.length - 1) {
        console.log('  次のソースまで10秒待機...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    // 最終統計
    console.log('\n=== 最終統計 ===');
    displayStatistics(stats);
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    console.log(`\n処理時間: ${Math.floor(duration / 60)}分${duration % 60}秒`);
    console.log('完了時刻:', new Date().toLocaleString('ja-JP'));
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

async function getSourceStatistics(
  sourceName: string, 
  options: RegenerationOptions
): Promise<SourceStats> {
  // 全記事を取得
  const articles = await prisma.article.findMany({
    where: {
      source: {
        name: sourceName
      }
    },
    select: {
      id: true,
      content: true,
      summaryVersion: true,
    }
  });
  
  // エンリッチメント済み記事（2000文字以上）を抽出
  const enrichedArticles = articles.filter(a => 
    a.content && a.content.length >= 2000
  );
  
  // 対象記事の決定
  let targetArticles = enrichedArticles;
  
  // forceオプションがない場合は古いバージョンのみ
  if (!options.force) {
    targetArticles = enrichedArticles.filter(a => 
      !a.summaryVersion || a.summaryVersion < 8
    );
  }
  
  // テストモードの場合は最初の5件
  if (options.testMode) {
    targetArticles = targetArticles.slice(0, 5);
  }
  
  // limit指定がある場合
  if (options.limit && targetArticles.length > options.limit) {
    targetArticles = targetArticles.slice(0, options.limit);
  }
  
  return {
    name: sourceName,
    totalArticles: articles.length,
    enrichedArticles: enrichedArticles.length,
    targetArticles: targetArticles.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };
}

async function processSource(
  sourceName: string,
  stat: SourceStats,
  options: RegenerationOptions
) {
  // 対象記事を取得
  const query = prisma.article.findMany({
    where: {
      source: {
        name: sourceName
      },
      content: {
        not: null
      }
    },
    include: {
      source: true,
      tags: true,
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });
  
  const articles = await query;
  
  // エンリッチメント済みでフィルタ
  let targetArticles = articles.filter(a => 
    a.content && a.content.length >= 2000
  );
  
  // forceオプションがない場合は古いバージョンのみ
  if (!options.force) {
    targetArticles = targetArticles.filter(a => 
      !a.summaryVersion || a.summaryVersion < 8
    );
  }
  
  // テストモードの場合は最初の5件
  if (options.testMode) {
    targetArticles = targetArticles.slice(0, 5);
  }
  
  // continueFromが指定されている場合
  if (options.continueFrom) {
    const index = targetArticles.findIndex(a => a.id === options.continueFrom);
    if (index >= 0) {
      targetArticles = targetArticles.slice(index);
      console.log(`  記事ID ${options.continueFrom} から再開`);
    }
  }
  
  // 処理実行
  for (let i = 0; i < targetArticles.length; i++) {
    const article = targetArticles[i];
    stat.processed++;
    
    try {
      if (options.verbose) {
        console.log(`  [${i + 1}/${targetArticles.length}] ${article.title}`);
        console.log(`    コンテンツ長: ${article.content?.length || 0}文字`);
        console.log(`    現在のバージョン: ${article.summaryVersion || 'なし'}`);
      } else {
        process.stdout.write(`  処理中: ${i + 1}/${targetArticles.length}\r`);
      }
      
      // 要約生成
      const result = await summaryService.generate(
        article.title,
        article.content!
      );
      
      if (result) {
        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: 8,
            articleType: 'unified'
          }
        });
        
        stat.succeeded++;
        
        if (options.verbose) {
          console.log(`    ✅ 成功: 要約${result.summary.length}文字 / 詳細${result.detailedSummary.length}文字`);
        }
      } else {
        stat.failed++;
        if (options.verbose) {
          console.log('    ❌ 要約生成失敗');
        }
      }
      
      // Rate limit対策
      const waitTime = (i + 1) % 10 === 0 ? 10000 : 5000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
    } catch (error) {
      stat.failed++;
      
      if (options.verbose) {
        console.error(`    ❌ エラー:`, error instanceof Error ? error.message : String(error));
      }
      
      // Rate limitエラーの場合は長めに待機
      if (error instanceof Error && error.message.includes('429')) {
        console.log('\n  Rate limit検出。60秒待機...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
      
      // 進捗を保存（中断時の再開用）
      await saveProgress(sourceName, article.id);
    }
  }
  
  if (!options.verbose) {
    console.log(); // 改行
  }
  
  console.log(`  完了: 成功${stat.succeeded}件 / 失敗${stat.failed}件`);
}

async function saveProgress(sourceName: string, articleId: string) {
  const fs = await import('fs/promises');
  const progress = {
    sourceName,
    articleId,
    timestamp: new Date().toISOString(),
  };
  
  try {
    await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.error('進捗保存エラー:', error);
  }
}

function displayStatistics(stats: Map<string, SourceStats>) {
  console.log('\n統計情報:');
  console.log('ソース名                      | 全記事 | エンリッチ済 | 対象 | 処理済 | 成功 | 失敗 |');
  console.log('------------------------------|--------|-------------|------|--------|------|------|');
  
  let totalArticles = 0;
  let totalEnriched = 0;
  let totalTarget = 0;
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  
  stats.forEach((stat) => {
    console.log(
      `${stat.name.padEnd(29)} | ${String(stat.totalArticles).padStart(6)} | ` +
      `${String(stat.enrichedArticles).padStart(11)} | ${String(stat.targetArticles).padStart(4)} | ` +
      `${String(stat.processed).padStart(6)} | ${String(stat.succeeded).padStart(4)} | ` +
      `${String(stat.failed).padStart(4)} |`
    );
    
    totalArticles += stat.totalArticles;
    totalEnriched += stat.enrichedArticles;
    totalTarget += stat.targetArticles;
    totalProcessed += stat.processed;
    totalSucceeded += stat.succeeded;
    totalFailed += stat.failed;
  });
  
  console.log('------------------------------|--------|-------------|------|--------|------|------|');
  console.log(
    `${'合計'.padEnd(29)} | ${String(totalArticles).padStart(6)} | ` +
    `${String(totalEnriched).padStart(11)} | ${String(totalTarget).padStart(4)} | ` +
    `${String(totalProcessed).padStart(6)} | ${String(totalSucceeded).padStart(4)} | ` +
    `${String(totalFailed).padStart(4)} |`
  );
}

// 実行
main().catch(console.error);