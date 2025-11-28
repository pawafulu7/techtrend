#!/usr/bin/env npx tsx
/**
 * エンリッチメントされたはてなブックマーク記事の要約を再生成
 * より充実したコンテンツから正確な要約を生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const PROGRESS_FILE = path.join(process.cwd(), '.regenerate-hatena-progress.json');

interface RegenerationResult {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

interface ProgressData {
  lastProcessedId: string | number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  timestamp: string;
}

// 進捗を保存
function saveProgress(lastId: string | number, processed: number, success: number, failed: number): void {
  const progress: ProgressData = {
    lastProcessedId: typeof lastId === 'string' ? lastId : lastId,
    processedCount: processed,
    successCount: success,
    failedCount: failed,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// 進捗を読み込み
function loadProgress(): ProgressData | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('⚠️  進捗ファイルの読み込みに失敗しました:', error);
  }
  return null;
}

// 進捗ファイルを削除
function clearProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.error('✅ 進捗ファイルを削除しました');
    }
  } catch (error) {
    console.error('⚠️  進捗ファイルの削除に失敗しました:', error);
  }
}

async function regenerateSummaries(limit?: number, testMode: boolean = false, continueMode: boolean = false): Promise<RegenerationResult> {
  const result: RegenerationResult = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Gemini APIキーの確認
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
      return result;
    }

    // UnifiedSummaryServiceのインスタンス作成
    const summaryService = new UnifiedSummaryService(apiKey);
    
    // はてなブックマークのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'はてなブックマーク' }
    });

    if (!source) {
      console.error('❌ はてなブックマークのソースが見つかりません');
      return result;
    }

    // 継続モードの場合、前回の進捗を読み込み
    let lastProcessedId: string | null = null;
    let existingProgress: ProgressData | null = null;
    
    if (continueMode) {
      existingProgress = loadProgress();
      if (existingProgress && existingProgress.lastProcessedId) {
        lastProcessedId = String(existingProgress.lastProcessedId);
        result.processed = existingProgress.processedCount;
        result.success = existingProgress.successCount;
        result.failed = existingProgress.failedCount;
        console.error('📝 前回の進捗を読み込みました:');
        console.error(`   最後に処理したID: ${lastProcessedId}`);
        console.error(`   処理済み: ${existingProgress.processedCount}件`);
        console.error(`   成功: ${existingProgress.successCount}件`);
        console.error(`   失敗: ${existingProgress.failedCount}件`);
        console.error(`   前回実行: ${existingProgress.timestamp}`);
        console.error('');
      } else {
        console.error('⚠️  進捗ファイルが見つかりません。最初から実行します。');
        console.error('');
      }
    }

    // 対象記事を取得（エンリッチメント済みの記事）
    const whereCondition: any = {
      sourceId: source.id,
      content: { 
        not: null 
      }
    };
    
    // 継続モードの場合、最後に処理したID以降を取得
    if (continueMode && lastProcessedId) {
      whereCondition.id = { gt: lastProcessedId };
    }
    
    const articles = await prisma.article.findMany({
      where: whereCondition,
      orderBy: [
        { id: 'asc' } // ID昇順で処理（継続実行のため）
      ],
      take: limit || undefined,
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
        summary: true,
        detailedSummary: true,
        summaryVersion: true,
        updatedAt: true
      }
    });

    // コンテンツが充実した記事のみフィルタリング（1000文字以上）
    const targetArticles = articles.filter(article => {
      const contentLength = article.content?.length || 0;
      return contentLength >= 1000;
    });

    result.total = targetArticles.length;
    
    console.error('='.repeat(60));
    console.error('はてなブックマーク記事要約再生成');
    console.error('='.repeat(60));
    console.error(`処理対象: ${result.total}件`);
    console.error(`モード: ${testMode ? 'テスト' : '本番'}`);
    if (limit) console.error(`制限: ${limit}件`);
    console.error('='.repeat(60));
    console.error('');

    // 各記事を処理
    for (let i = 0; i < targetArticles.length; i++) {
      const article = targetArticles[i];
      const contentLength = article.content?.length || 0;
      const currentIndex = continueMode && existingProgress ? existingProgress.processedCount + i + 1 : i + 1;
      
      console.error(`[${currentIndex}/${result.total + (existingProgress?.processedCount || 0)}] ${article.title.substring(0, 50)}...`);
      console.error(`  ID: ${article.id}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  コンテンツ: ${contentLength}文字`);
      console.error(`  現在の要約: ${article.summary?.length || 0}文字`);
      console.error(`  現在の詳細要約: ${article.detailedSummary?.length || 0}文字`);
      
      result.processed++;

      try {
        // 要約生成
        console.error(`  要約生成中...`);
        const startTime = Date.now();
        
        const summaryResult = await summaryService.generate(
          article.title,
          article.content || ''
        );
        
        const endTime = Date.now();
        
        // generate()が成功した場合、結果を直接使用
        if (summaryResult.summary && summaryResult.detailedSummary) {
          // データベースを更新
          if (!testMode) {
            await prisma.article.update({
              where: { id: article.id },
              data: {
                summary: summaryResult.summary,
                detailedSummary: summaryResult.detailedSummary,
                summaryVersion: 5, // 統一フォーマットバージョン
                articleType: 'unified'
              }
            });
          }
          
          console.error(`  ✅ 成功`);
          console.error(`    - 新要約: ${summaryResult.summary.length}文字`);
          console.error(`    - 新詳細要約: ${summaryResult.detailedSummary.length}文字`);
          console.error(`    - 実行時間: ${endTime - startTime}ms`);
          
          result.success++;
        } else {
          console.error(`  ❌ 要約生成失敗: 要約または詳細要約が空`);
          result.failed++;
          result.errors.push(`${article.title}: 要約または詳細要約が空`);
        }
        
        // 進捗を保存（本番モードのみ）
        if (!testMode) {
          saveProgress(article.id, result.processed, result.success, result.failed);
        }
        
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ❌ エラー: ${errorMsg}`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMsg}`);
        
        // エラーでも進捗を保存
        if (!testMode) {
          saveProgress(article.id, result.processed, result.success, result.failed);
        }
      }
      
      // Rate limit対策（本番モードのみ）
      if (!testMode && i < targetArticles.length - 1) {
        const waitTime = 5000; // 5秒待機
        console.error(`  待機中... (${waitTime / 1000}秒)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      console.error('');
      
      // 100件ごとに長めの待機（本番モードのみ）
      if (!testMode && (i + 1) % 100 === 0 && i < targetArticles.length - 1) {
        console.error('='.repeat(60));
        console.error('100件処理完了。長期待機中... (30秒)');
        console.error('='.repeat(60));
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }

  } catch (error) {
    console.error('処理中にエラーが発生しました:', error);
    result.errors.push(`全体エラー: ${error}`);
  }

  return result;
}

async function main() {
  // コマンドライン引数の処理
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const continueMode = args.includes('--continue');
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

  // 実行
  const result = await regenerateSummaries(limit, testMode, continueMode);
  
  // 結果サマリー
  console.error('='.repeat(60));
  console.error('処理結果サマリー');
  console.error('='.repeat(60));
  console.error(`対象記事数: ${result.total}`);
  console.error(`処理済み: ${result.processed}`);
  console.error(`成功: ${result.success}`);
  console.error(`失敗: ${result.failed}`);
  console.error(`スキップ: ${result.skipped}`);
  
  if (result.success > 0) {
    const successRate = ((result.success / result.processed) * 100).toFixed(1);
    console.error(`成功率: ${successRate}%`);
  }
  
  if (result.errors.length > 0 && result.errors.length <= 5) {
    console.error('\nエラー詳細:');
    result.errors.forEach(err => console.error(`  - ${err}`));
  } else if (result.errors.length > 5) {
    console.error(`\nエラー: ${result.errors.length}件（詳細は省略）`);
  }
  
  // 完了時の処理
  if (!testMode) {
    if (result.total === result.processed && result.failed === 0) {
      // 全て正常に完了した場合、進捗ファイルを削除
      clearProgress();
      console.error('\n✅ 全ての処理が完了しました');
    } else if (result.total > 0) {
      console.error('\n📝 進捗が保存されました。--continue オプションで継続実行できます');
    }
  }
  
  if (testMode) {
    console.error('\n⚠️  テストモード: データベースは更新されていません');
  } else if (result.success > 0) {
    console.error('\n✅ 要約が更新されました');
  }
  
  console.error('='.repeat(60));
  
  await prisma.$disconnect();
  process.exit(result.failed > result.success ? 1 : 0);
}

// 使用方法の表示
if (process.argv.includes('--help')) {
  console.error('使用方法:');
  console.error('  npx tsx scripts/regenerate-hatena-summaries.ts [オプション]');
  console.error('');
  console.error('オプション:');
  console.error('  --test        テストモード（データベース更新なし）');
  console.error('  --continue    前回の続きから実行（進捗ファイルから再開）');
  console.error('  --limit=N     処理する記事数を制限');
  console.error('  --help        このヘルプを表示');
  console.error('');
  console.error('例:');
  console.error('  npx tsx scripts/regenerate-hatena-summaries.ts --test --limit=10');
  console.error('  npx tsx scripts/regenerate-hatena-summaries.ts --limit=50');
  console.error('  npx tsx scripts/regenerate-hatena-summaries.ts --continue  # 前回の続きから');
  console.error('  npx tsx scripts/regenerate-hatena-summaries.ts');
  console.error('');
  console.error('進捗管理:');
  console.error('  - 処理中の進捗は .regenerate-hatena-progress.json に保存されます');
  console.error('  - 中断した場合は --continue で続きから再開できます');
  console.error('  - 全処理完了時に進捗ファイルは自動削除されます');
  console.error('');
  console.error('注意: GEMINI_API_KEY環境変数の設定が必要です');
  process.exit(0);
}

main().catch(console.error);