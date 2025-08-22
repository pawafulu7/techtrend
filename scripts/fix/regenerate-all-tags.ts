#!/usr/bin/env npx tsx
/**
 * 既存記事のタグを再生成するスクリプト
 * - データベースに保存済みの記事のタグをすべて再生成
 * - 新しいタグ正規化ルールとカテゴリを適用
 * - バッチ処理でRate Limitを回避
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import { TagNormalizer } from '../../lib/services/tag-normalizer';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient();
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

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
 */
async function regenerateTagsWithAI(
  articleId: string, 
  title: string, 
  content: string | null,
  detailedSummary: string | null
): Promise<void> {
  try {
    // コンテンツが不足している場合は詳細要約を使用
    const textContent = content || detailedSummary || '';
    
    if (!textContent) {
      console.log(`⚠️ コンテンツ不足のためスキップ (ID: ${articleId})`);
      throw new Error('No content available');
    }
    
    // AI要約生成（タグとカテゴリのみ使用）
    console.log(`🤖 AI生成開始: ${title.substring(0, 50)}...`);
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
  } catch (error) {
    console.error(`❌ AI生成エラー (ID: ${articleId}):`, error);
    throw error;
  }
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
    
    console.log('='.repeat(60));
    console.log('🏷️  既存記事のタグ再生成スクリプト');
    console.log('='.repeat(60));
    console.log(`モード: ${mode === 'regenerate' ? 'AI再生成' : 'タグ正規化のみ'}`);
    console.log(`バッチサイズ: ${BATCH_SIZE}記事`);
    console.log(`記事間待機: ${DELAY_BETWEEN_ARTICLES}ms`);
    console.log(`バッチ間待機: ${DELAY_BETWEEN_BATCHES}ms`);
    if (limit) console.log(`処理上限: ${limit}記事`);
    console.log('='.repeat(60));
    
    // 記事を取得
    // regenerateモードでも全記事を対象にする（summaryVersionフィールドの問題を回避）
    const whereCondition = {};
    
    const articles = await prisma.article.findMany({
      where: whereCondition,
      include: {
        tags: true,
        source: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    
    stats.total = articles.length;
    console.log(`\n📊 対象記事数: ${stats.total}件\n`);
    
    if (stats.total === 0) {
      console.log('✨ 処理対象の記事がありません');
      return;
    }
    
    // バッチ処理
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
      const batch = articles.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(articles.length / BATCH_SIZE);
      
      console.log(`\n📦 バッチ ${batchNumber}/${totalBatches} を処理中...`);
      console.log('-'.repeat(40));
      
      for (const article of batch) {
        stats.processed++;
        const progress = `[${stats.processed}/${stats.total}]`;
        
        try {
          console.log(`\n${progress} 処理中: ${article.title.substring(0, 60)}...`);
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
          
          // Rate Limit対策の待機
          if (mode === 'regenerate' && stats.processed < stats.total) {
            await delay(DELAY_BETWEEN_ARTICLES);
          }
          
        } catch (error) {
          stats.failed++;
          console.error(`  ⚠️ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // エラーが続く場合は中断
          if (stats.failed > 10) {
            console.error('\n❌ エラーが多すぎるため処理を中断します');
            break;
          }
        }
      }
      
      // バッチ間の待機（最後のバッチ以外）
      if (mode === 'regenerate' && i + BATCH_SIZE < articles.length) {
        console.log(`\n⏳ 次のバッチまで ${DELAY_BETWEEN_BATCHES / 1000}秒待機中...`);
        await delay(DELAY_BETWEEN_BATCHES);
      }
    }
    
    // 統計表示
    const endTime = new Date();
    const duration = Math.round((endTime.getTime() - stats.startTime.getTime()) / 1000);
    
    console.log('\n' + '='.repeat(60));
    console.log('📈 処理完了統計');
    console.log('='.repeat(60));
    console.log(`総記事数: ${stats.total}`);
    console.log(`処理済み: ${stats.processed}`);
    console.log(`成功: ${stats.success} (${Math.round(stats.success / stats.total * 100)}%)`);
    console.log(`失敗: ${stats.failed}`);
    console.log(`スキップ: ${stats.skipped}`);
    console.log(`処理時間: ${duration}秒`);
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
  npx tsx scripts/fix/regenerate-all-tags.ts [mode] [limit]

モード:
  normalize   - タグの正規化のみ実行（デフォルト、高速）
  regenerate  - AIを使って完全に再生成（低速、API使用）

例:
  npx tsx scripts/fix/regenerate-all-tags.ts              # 全記事のタグを正規化
  npx tsx scripts/fix/regenerate-all-tags.ts normalize 100 # 100記事のタグを正規化
  npx tsx scripts/fix/regenerate-all-tags.ts regenerate 10 # 10記事のタグをAI再生成
`);
  process.exit(0);
}

main().catch(console.error);