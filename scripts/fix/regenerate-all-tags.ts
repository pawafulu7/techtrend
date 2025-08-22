#!/usr/bin/env npx tsx
/**
 * 既存記事のタグを再生成するスクリプト
 * - データベースに保存済みの記事のタグをすべて再生成
 * - 新しいタグ正規化ルールとカテゴリを適用
 * - バッチ処理でRate Limitを回避
 * - 進捗管理機能付き（中断後の再開可能）
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { TagNormalizer } from '../../lib/services/tag-normalizer';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
const PROGRESS_FILE = path.join(process.cwd(), '.tag-regeneration-progress.json');
const summaryService = new UnifiedSummaryService();

// 処理設定
const BATCH_SIZE = 10;  // 一度に処理する記事数
const DELAY_BETWEEN_ARTICLES = 3000;  // 記事間の待機時間（ミリ秒）
const DELAY_BETWEEN_BATCHES = 30000;  // バッチ間の待機時間（ミリ秒）

interface ProcessingStats {
  total: number;
  processed: number;
  success: number;
  failed: number;
  skipped: number;
  startTime: Date;
}

interface Progress {
  mode: string;
  lastProcessedId: string | null;
  lastProcessedAt: Date;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 進捗を保存
 */
function saveProgress(progress: Progress): void {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
    console.log(`💾 進捗を保存しました: ${PROGRESS_FILE}`);
  } catch (error) {
    console.error('⚠️ 進捗の保存に失敗:', error);
  }
}

/**
 * 進捗を読み込み
 */
function loadProgress(mode: string): Progress | null {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
      // モードが一致する場合のみ進捗を使用
      if (data.mode === mode) {
        console.log(`📂 前回の進捗を読み込みました: ${data.totalProcessed}件処理済み`);
        console.log(`   最後に処理したID: ${data.lastProcessedId}`);
        return data;
      } else {
        console.log(`⚠️ モードが異なるため進捗をリセットします（前回: ${data.mode}, 今回: ${mode}）`);
      }
    }
  } catch (error) {
    console.error('⚠️ 進捗の読み込みに失敗:', error);
  }
  return null;
}

/**
 * 進捗をクリア
 */
function clearProgress(): void {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log('🗑️ 進捗ファイルを削除しました');
    }
  } catch (error) {
    console.error('⚠️ 進捗ファイルの削除に失敗:', error);
  }
}

/**
 * 既存のタグをタグ正規化のみで更新（API呼び出しなし）
 */
async function regenerateTagsWithoutAPI(articleId: string, existingTags: string[]): Promise<void> {
  try {
    // タグの正規化
    const normalizedTags = TagNormalizer.normalizeTags(existingTags);
    const category = TagNormalizer.inferCategory(normalizedTags);
    
    // データベース更新
    await prisma.$transaction(async (tx) => {
      // 既存のタグ関係を削除
      await tx.article.update({
        where: { id: articleId },
        data: {
          tags: {
            set: []  // すべてのタグとの関係を削除
          }
        }
      });
      
      // 新しいタグを設定
      await tx.article.update({
        where: { id: articleId },
        data: {
          tags: {
            connectOrCreate: normalizedTags.map(tag => ({
              where: { name: tag.name },
              create: { 
                name: tag.name,
                category: tag.category || category
              }
            }))
          }
        }
      });
    });
    
    console.log(`✅ タグ正規化完了: ${existingTags.join(', ')} → ${normalizedTags.map(t => t.name).join(', ')}`);
  } catch (error) {
    console.error(`❌ タグ正規化エラー (ID: ${articleId}):`, error);
    throw error;
  }
}

/**
 * AIを使って完全に再生成（タイトルとコンテンツから）
 * リトライ機能付き
 */
async function regenerateTagsWithAI(
  articleId: string, 
  title: string, 
  content: string | null,
  detailedSummary: string | null,
  maxRetries: number = 3
): Promise<void> {
  // コンテンツが不足している場合は詳細要約を使用
  const textContent = content || detailedSummary || '';
  
  if (!textContent) {
    console.log(`⚠️ コンテンツ不足のためスキップ (ID: ${articleId})`);
    throw new Error('No content available');
  }
  
  let lastError: Error | null = null;
  
  // リトライループ
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // AI要約生成（タグとカテゴリのみ使用）
      console.log(`🤖 AI生成開始 (試行 ${attempt}/${maxRetries}): ${title.substring(0, 50)}...`);
      const result = await summaryService.generate(title, textContent);
      
      // データベース更新
      await prisma.$transaction(async (tx) => {
      // 既存のタグ関係を削除
      await tx.article.update({
        where: { id: articleId },
        data: {
          tags: {
            set: []
          }
        }
      });
      
      // 新しいタグとカテゴリを設定
      await tx.article.update({
        where: { id: articleId },
        data: {
          // summaryVersionフィールドは使わない
          tags: {
            connectOrCreate: result.tags.map(tagName => ({
              where: { name: tagName },
              create: { 
                name: tagName,
                category: result.category
              }
            }))
          }
        }
      });
    });
      
      console.log(`✅ AI生成完了: タグ=${result.tags.join(', ')}, カテゴリ=${result.category || 'なし'}`);
      return; // 成功したらリトライループを抜ける
      
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ AI生成エラー (ID: ${articleId}, 試行 ${attempt}/${maxRetries}):`, error);
      
      // Rate Limitエラーの場合は長めに待機
      if (error?.message?.includes('429') || error?.message?.includes('rate')) {
        console.log(`⏳ Rate Limitエラーのため30秒待機...`);
        await delay(30000);
      } else if (attempt < maxRetries) {
        // 通常のエラーの場合は5秒待機してリトライ
        console.log(`⏳ ${5}秒後にリトライします...`);
        await delay(5000);
      }
    }
  }
  
  // すべてのリトライが失敗した場合
  throw new Error(`${maxRetries}回の試行後も失敗: ${lastError?.message}`);
}

async function main() {
  const stats: ProcessingStats = {
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    startTime: new Date()
  };
  
  try {
    // 処理モードの選択
    const mode = process.argv[2] || 'normalize';  // normalize or regenerate
    const limit = process.argv[3] ? parseInt(process.argv[3]) : undefined;
    const continueFlag = process.argv.includes('--continue');
    const resetFlag = process.argv.includes('--reset');
    
    console.log('='.repeat(60));
    console.log('🏷️  既存記事のタグ再生成スクリプト');
    console.log('='.repeat(60));
    console.log(`モード: ${mode === 'regenerate' ? 'AI再生成' : 'タグ正規化のみ'}`);
    console.log(`バッチサイズ: ${BATCH_SIZE}記事`);
    console.log(`記事間待機: ${DELAY_BETWEEN_ARTICLES}ms`);
    console.log(`バッチ間待機: ${DELAY_BETWEEN_BATCHES}ms`);
    if (limit) console.log(`処理上限: ${limit}記事`);
    if (continueFlag) console.log(`📂 前回の続きから処理を再開`);
    if (resetFlag) console.log(`🔄 進捗をリセットして最初から処理`);
    console.log('='.repeat(60));
    
    // リセットフラグが指定された場合は進捗をクリア
    if (resetFlag) {
      clearProgress();
    }
    
    // 進捗を読み込み（continueフラグが指定された場合のみ）
    let progress: Progress | null = null;
    if (continueFlag) {
      progress = loadProgress(mode);
    }
    
    // 記事を取得
    const whereCondition: any = {};
    
    // 進捗がある場合は、最後に処理したID以降の記事を取得
    if (progress && progress.lastProcessedId) {
      // 古い順で処理しているので、処理済みIDより新しい記事から再開
      const lastProcessedArticle = await prisma.article.findUnique({
        where: { id: progress.lastProcessedId }
      });
      
      if (lastProcessedArticle) {
        whereCondition.createdAt = {
          gt: lastProcessedArticle.createdAt  // より新しい記事から再開
        };
      }
    }
    
    const articles = await prisma.article.findMany({
      where: whereCondition,
      include: {
        tags: true,
        source: true
      },
      orderBy: { createdAt: 'asc' },  // 古い順に変更
      ...(limit ? { take: limit } : {})
    });
    
    stats.total = articles.length;
    
    // 前回の進捗がある場合は累計を引き継ぐ
    if (progress) {
      console.log(`\n📊 今回の対象記事数: ${stats.total}件`);
      console.log(`📈 累計処理済み: ${progress.totalProcessed}件`);
      stats.processed = progress.totalProcessed;
      stats.success = progress.totalSuccess;
      stats.failed = progress.totalFailed;
    } else {
      console.log(`\n📊 対象記事数: ${stats.total}件\n`);
    }
    
    if (stats.total === 0) {
      console.log('✨ 処理対象の記事がありません');
      if (progress) {
        console.log(`\n🎉 全記事の処理が完了しています！`);
        console.log(`   累計処理: ${progress.totalProcessed}件`);
        console.log(`   成功: ${progress.totalSuccess}件`);
        console.log(`   失敗: ${progress.totalFailed}件`);
        clearProgress();
      }
      return;
    }
    
    // 最後に処理したIDを保持
    let lastProcessedId: string | null = progress?.lastProcessedId || null;
    
    // バッチ処理
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(articles.length / BATCH_SIZE);
      
      console.log(`\n📦 バッチ ${batchNumber}/${totalBatches} を処理中...`);
      console.log('-'.repeat(40));
      
      for (const article of batch) {
        stats.processed++;
        const progressText = `[${stats.processed}]`;
        
        try {
          console.log(`\n${progressText} 処理中: ${article.title.substring(0, 60)}...`);
          console.log(`  ソース: ${article.source.name}`);
          console.log(`  現在のタグ: ${article.tags.map(t => t.name).join(', ')}`);
          
          if (mode === 'regenerate') {
            // AI再生成モード
            await regenerateTagsWithAI(
              article.id,
              article.title,
              article.content,
              article.detailedSummary
            );
          } else {
            // 正規化のみモード
            await regenerateTagsWithoutAPI(
              article.id,
              article.tags.map(t => t.name)
            );
          }
          
          stats.success++;
          
          // 成功した場合のみ最後に処理したIDを更新
          lastProcessedId = article.id;
          
          // 進捗を定期的に保存（10件ごと、成功した記事のみカウント）
          if (stats.success % 10 === 0) {
            saveProgress({
              mode,
              lastProcessedId,
              lastProcessedAt: new Date(),
              totalProcessed: stats.processed,
              totalSuccess: stats.success,
              totalFailed: stats.failed
            });
          }
          
          // Rate Limit対策の待機
          if (mode === 'regenerate' && i + 1 < articles.length) {
            await delay(DELAY_BETWEEN_ARTICLES);
          }
          
        } catch (error) {
          stats.failed++;
          console.error(`  ⚠️ 最終的なエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // 失敗した記事のIDは進捗に含めない（lastProcessedIdは更新しない）
          console.log(`  ⚠️ 記事ID ${article.id} は処理に失敗したため、次回再試行されます`);
          
          // 1つでも失敗したら即座に中断（リトライ3回後の失敗）
          console.error('\n❌ 処理に失敗したため中断します');
          // 中断前に進捗を保存（最後に成功したIDまで）
          if (lastProcessedId) {
            saveProgress({
              mode,
              lastProcessedId, // 最後に成功したIDのみ保存
              lastProcessedAt: new Date(),
              totalProcessed: stats.processed,
              totalSuccess: stats.success,
              totalFailed: stats.failed
            });
          }
          process.exit(1);  // 即終了
        }
      }
      
      // バッチ間の待機（最後のバッチ以外）
      if (mode === 'regenerate' && i + BATCH_SIZE < articles.length) {
        console.log(`\n⏳ 次のバッチまで ${DELAY_BETWEEN_BATCHES / 1000}秒待機中...`);
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }
    
    // 最終的な進捗を保存
    if (lastProcessedId) {
      saveProgress({
        mode,
        lastProcessedId,
        lastProcessedAt: new Date(),
        totalProcessed: stats.processed,
        totalSuccess: stats.success,
        totalFailed: stats.failed
      });
    }
    
    // 統計表示
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - stats.startTime.getTime()) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 処理完了統計');
    console.log('='.repeat(60));
    console.log(`今回の処理: ${stats.total}件`);
    console.log(`累計処理済み: ${stats.processed}件`);
    console.log(`累計成功: ${stats.success}件`);
    if (stats.processed > 0) {
      console.log(`成功率: ${Math.round(stats.success / stats.processed * 100)}%`);
    }
    console.log(`累計失敗: ${stats.failed}件`);
    console.log(`今回の処理時間: ${duration}秒`);
    console.log('='.repeat(60));
    
    // 不要になったタグのクリーンアップ
    if (mode === 'normalize') {
      console.log('\n🧹 未使用タグのクリーンアップ...');
      const orphanedTags = await prisma.tag.findMany({
        where: {
          articles: {
            none: {}
          }
        }
      });
      
      if (orphanedTags.length > 0) {
        console.log(`  ${orphanedTags.length}個の未使用タグを削除します`);
        await prisma.tag.deleteMany({
          where: {
            id: {
              in: orphanedTags.map(t => t.id)
            }
          }
        });
        console.log('  ✅ クリーンアップ完了');
      } else {
        console.log('  ✨ 未使用タグはありません');
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 使用方法の表示
if (process.argv.includes('--help')) {
  console.log(`
使用方法:
  npx tsx scripts/fix/regenerate-all-tags.ts [mode] [limit] [options]

モード:
  normalize   - タグの正規化のみ実行（デフォルト、高速）
  regenerate  - AIを使って完全に再生成（低速、API使用）

オプション:
  --continue  - 前回の続きから処理を再開
  --reset     - 進捗をリセットして最初から処理
  --help      - このヘルプを表示

例:
  npx tsx scripts/fix/regenerate-all-tags.ts              # 全記事のタグを正規化
  npx tsx scripts/fix/regenerate-all-tags.ts normalize 100 # 100記事のタグを正規化
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate 10 # 10記事のタグをAI再生成
  
  # 進捗管理付きの実行
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate 100           # 100件処理
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate 100 --continue # 続きから100件
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate --continue    # 続きから全件
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate --reset       # 最初からやり直し

進捗ファイル:
  .tag-regeneration-progress.json に進捗が保存されます
`);
  process.exit(0);
}

main().catch(console.error);