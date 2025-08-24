/**
 * Phase 4: バッチ再生成スクリプト
 * 低品質な要約を検出し、段階的に改善する
 */

import { PrismaClient } from '@prisma/client';
import { GeminiClient } from '../lib/ai/gemini';
import { 
  validateSummary,
  autoFixSummary
} from '../lib/utils/summary-validator';
import { detectArticleType } from '../lib/utils/article-type-detector';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// コマンドライン引数の処理
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const sourceName = args.find(arg => arg.startsWith('--source='))?.split('=')[1];
const limit = parseInt(args.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100');
const createBackup = !args.includes('--no-backup');

interface ImprovementResult {
  articleId: number;
  title: string;
  sourceName: string;
  originalSummary: string | null;
  originalLength: number;
  improvedSummary: string | null;
  improvedLength: number;
  method: 'auto-fix' | 'regenerate' | 'failed';
  errors: string[];
}

async function improveSummariesBatch() {
  console.error('===== Phase 4: バッチ要約改善 =====\n');
  
  if (isDryRun) {
    console.error('🔍 ドライランモード: 実際の更新は行いません\n');
  }
  
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error('❌ GEMINI_API_KEY環境変数が設定されていません');
    process.exit(1);
  }
  
  const geminiClient = new GeminiClient(geminiApiKey);
  
  // バックアップの作成
  if (createBackup && !isDryRun) {
    await createBackupFile();
  }
  
  // 低品質要約の検出
  console.error('📊 低品質要約を検出中...\n');
  
  const whereClause: any = {
    summary: {
      not: null
    }
  };
  
  if (sourceName) {
    whereClause.source = {
      name: sourceName
    };
  }
  
  const articles = await prisma.article.findMany({
    where: whereClause,
    include: {
      source: true
    },
    orderBy: {
      publishedAt: 'desc'
    },
    take: limit
  });
  
  console.error(`対象記事数: ${articles.length}件\n`);
  
  const results: ImprovementResult[] = [];
  let processedCount = 0;
  let improvedCount = 0;
  let regeneratedCount = 0;
  let failedCount = 0;
  
  // バッチサイズの設定（API制限対策）
  const batchSize = 10;
  
  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, Math.min(i + batchSize, articles.length));
    
    console.error(`\n📦 バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(articles.length / batchSize)} を処理中...`);
    
    for (const article of batch) {
      processedCount++;
      
      if (!article.summary) continue;
      
      const validation = validateSummary(article.summary);
      
      if (validation.isValid) {
        // すでに有効な要約
        continue;
      }
      
      console.error(`\n[${processedCount}/${articles.length}] ${article.title.substring(0, 50)}...`);
      console.error(`  元の文字数: ${article.summary.length}文字`);
      console.error(`  問題: ${validation.errors.join(', ')}`);
      
      // まず自動修正を試みる
      const autoFixed = autoFixSummary(article.summary, 130);
      const autoFixValidation = validateSummary(autoFixed);
      
      if (autoFixValidation.isValid) {
        console.error(`  ✅ 自動修正で解決（${autoFixed.length}文字）`);
        
        if (!isDryRun) {
          await prisma.article.update({
            where: { id: article.id },
            data: { 
              summary: autoFixed,
              updatedAt: new Date()
            }
          });
        }
        
        results.push({
          articleId: article.id,
          title: article.title,
          sourceName: article.source.name,
          originalSummary: article.summary,
          originalLength: article.summary.length,
          improvedSummary: autoFixed,
          improvedLength: autoFixed.length,
          method: 'auto-fix',
          errors: []
        });
        
        improvedCount++;
      } else {
        // 自動修正で解決しない場合は再生成
        console.error(`  🔄 再生成を実行中...`);
        
        try {
          const content = article.content || article.summary;
          const newSummary = await geminiClient.generateSummary(article.title, content);
          const newValidation = validateSummary(newSummary);
          
          if (newValidation.isValid) {
            console.error(`  ✅ 再生成成功（${newSummary.length}文字）`);
            
            if (!isDryRun) {
              await prisma.article.update({
                where: { id: article.id },
                data: { 
                  summary: newSummary,
                  updatedAt: new Date()
                }
              });
            }
            
            results.push({
              articleId: article.id,
              title: article.title,
              sourceName: article.source.name,
              originalSummary: article.summary,
              originalLength: article.summary.length,
              improvedSummary: newSummary,
              improvedLength: newSummary.length,
              method: 'regenerate',
              errors: []
            });
            
            regeneratedCount++;
          } else {
            console.error(`  ❌ 再生成後も問題あり: ${newValidation.errors.join(', ')}`);
            
            results.push({
              articleId: article.id,
              title: article.title,
              sourceName: article.source.name,
              originalSummary: article.summary,
              originalLength: article.summary.length,
              improvedSummary: null,
              improvedLength: 0,
              method: 'failed',
              errors: newValidation.errors
            });
            
            failedCount++;
          }
          
          // API制限対策
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`  ❌ エラー: ${error instanceof Error ? error.message : String(error)}`);
          
          results.push({
            articleId: article.id,
            title: article.title,
            sourceName: article.source.name,
            originalSummary: article.summary,
            originalLength: article.summary.length,
            improvedSummary: null,
            improvedLength: 0,
            method: 'failed',
            errors: [error instanceof Error ? error.message : String(error)]
          });
          
          failedCount++;
        }
      }
      
      // 進捗表示
      if (processedCount % 10 === 0) {
        const progress = Math.round((processedCount / articles.length) * 100);
        console.error(`\n📈 進捗: ${progress}% (${processedCount}/${articles.length})`);
      }
    }
    
    // バッチ間の待機
    if (i + batchSize < articles.length) {
      console.error('\n⏳ 次のバッチまで待機中...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // 結果レポートの生成
  console.error('\n\n===== 改善結果レポート =====\n');
  
  console.error('📊 処理サマリー:');
  console.error(`  処理済み: ${processedCount}件`);
  console.error(`  自動修正: ${improvedCount}件`);
  console.error(`  再生成: ${regeneratedCount}件`);
  console.error(`  失敗: ${failedCount}件`);
  
  // ソース別の統計
  const sourceStats = new Map<string, { improved: number; regenerated: number; failed: number }>();
  
  for (const result of results) {
    if (!sourceStats.has(result.sourceName)) {
      sourceStats.set(result.sourceName, { improved: 0, regenerated: 0, failed: 0 });
    }
    
    const stats = sourceStats.get(result.sourceName)!;
    if (result.method === 'auto-fix') stats.improved++;
    else if (result.method === 'regenerate') stats.regenerated++;
    else stats.failed++;
  }
  
  console.error('\n📈 ソース別結果:');
  for (const [source, stats] of sourceStats) {
    console.error(`  ${source}:`);
    console.error(`    自動修正: ${stats.improved}件`);
    console.error(`    再生成: ${stats.regenerated}件`);
    console.error(`    失敗: ${stats.failed}件`);
  }
  
  // 文字数の改善
  const lengthImprovements = results
    .filter(r => r.improvedSummary)
    .map(r => ({
      before: r.originalLength,
      after: r.improvedLength,
      diff: r.improvedLength - r.originalLength
    }));
  
  if (lengthImprovements.length > 0) {
    const avgBefore = Math.round(lengthImprovements.reduce((sum, i) => sum + i.before, 0) / lengthImprovements.length);
    const avgAfter = Math.round(lengthImprovements.reduce((sum, i) => sum + i.after, 0) / lengthImprovements.length);
    
    console.error('\n📏 文字数の改善:');
    console.error(`  改善前平均: ${avgBefore}文字`);
    console.error(`  改善後平均: ${avgAfter}文字`);
    console.error(`  平均増加: ${avgAfter - avgBefore}文字`);
  }
  
  // 詳細レポートの保存
  if (!isDryRun) {
    const reportPath = path.join(process.cwd(), '.claude', 'reports', `improvement_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    
    // ディレクトリ作成
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.error(`\n📝 詳細レポート保存: ${reportPath}`);
  }
  
  await prisma.$disconnect();
  
  console.error('\n===== バッチ処理完了 =====');
}

async function createBackupFile() {
  console.error('💾 バックアップを作成中...');
  
  const articles = await prisma.article.findMany({
    where: {
      summary: {
        not: null
      }
    },
    select: {
      id: true,
      title: true,
      summary: true
    }
  });
  
  const backupPath = path.join(process.cwd(), '.claude', 'backups', `summaries_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  
  // ディレクトリ作成
  const backupDir = path.dirname(backupPath);
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  fs.writeFileSync(backupPath, JSON.stringify(articles, null, 2));
  console.error(`  バックアップ保存: ${backupPath}\n`);
}

// 使用方法の表示
if (args.includes('--help')) {
  console.error(`
使用方法:
  npx tsx scripts/improve-summaries-batch.ts [オプション]

オプション:
  --dry-run        実際の更新を行わずにシミュレーション
  --source=NAME    特定のソースのみを処理
  --limit=N        処理する記事数の上限（デフォルト: 100）
  --no-backup      バックアップを作成しない
  --help           このヘルプを表示

例:
  npx tsx scripts/improve-summaries-batch.ts --dry-run
  npx tsx scripts/improve-summaries-batch.ts --source=Zenn --limit=50
  `);
  process.exit(0);
}

// スクリプト実行
improveSummariesBatch().catch(error => {
  console.error('エラー:', error);
  process.exit(1);
});