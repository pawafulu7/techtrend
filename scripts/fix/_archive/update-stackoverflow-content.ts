#!/usr/bin/env npx tsx
/**
 * Stack Overflow Blog記事のコンテンツを再取得・更新するスクリプト
 * 
 * 使用方法:
 *   npx tsx scripts/fix/update-stackoverflow-content.ts                  # 全記事を更新
 *   npx tsx scripts/fix/update-stackoverflow-content.ts --dry-run        # ドライラン
 *   npx tsx scripts/fix/update-stackoverflow-content.ts --batch-size=10  # 10件ずつ処理
 *   npx tsx scripts/fix/update-stackoverflow-content.ts --backup-only    # バックアップのみ
 *   npx tsx scripts/fix/update-stackoverflow-content.ts --restore        # バックアップから復元
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';
import fs from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();
const summaryService = new UnifiedSummaryService();

// コマンドライン引数の解析
const { values } = parseArgs({
  options: {
    'dry-run': {
      type: 'boolean',
      default: false,
    },
    'batch-size': {
      type: 'string',
      default: '10',
    },
    'backup-only': {
      type: 'boolean',
      default: false,
    },
    'restore': {
      type: 'boolean',
      default: false,
    },
    'regenerate-summary': {
      type: 'boolean',
    }
  },
  allowPositionals: true,
});

const isDryRun = values['dry-run'] as boolean;
const batchSize = parseInt(values['batch-size'] as string, 10);
const isBackupOnly = values['backup-only'] as boolean;
const isRestore = values['restore'] as boolean;
const shouldRegenerateSummary = values['regenerate-summary'] !== false;

// 遅延処理用のsleep関数
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// バックアップファイルパス
const getBackupPath = () => {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  return path.join(process.cwd(), 'backups', `stackoverflow-articles-backup-${date}.json`);
};

// バックアップ処理
async function backupArticles() {
  console.log('📦 既存記事のバックアップを開始...');
  
  // Stack Overflow Blogソースを取得
  const source = await prisma.source.findFirst({
    where: { name: 'Stack Overflow Blog' }
  });
  
  if (!source) {
    throw new Error('Stack Overflow Blog source not found');
  }
  
  // 全記事を取得
  const articles = await prisma.article.findMany({
    where: { sourceId: source.id },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`📊 ${articles.length}件の記事をバックアップ`);
  
  // バックアップディレクトリを作成
  const backupDir = path.join(process.cwd(), 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  
  // バックアップファイルに保存
  const backupPath = getBackupPath();
  await fs.writeFile(backupPath, JSON.stringify(articles, null, 2));
  
  console.log(`✅ バックアップ完了: ${backupPath}`);
  return backupPath;
}

// 復元処理
async function restoreArticles() {
  console.log('🔄 バックアップからの復元を開始...');
  
  const backupPath = getBackupPath();
  
  try {
    const backupData = await fs.readFile(backupPath, 'utf-8');
    const articles = JSON.parse(backupData);
    
    console.log(`📊 ${articles.length}件の記事を復元`);
    
    for (const article of articles) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          content: article.content,
          summary: article.summary,
          detailedSummary: article.detailedSummary,
          summaryVersion: article.summaryVersion,
          articleType: article.articleType,
        }
      });
    }
    
    console.log('✅ 復元完了');
  } catch (error) {
    console.error('❌ 復元エラー:', error);
    throw error;
  }
}

// メイン処理
async function main() {
  try {
    // バックアップのみの場合
    if (isBackupOnly) {
      await backupArticles();
      return;
    }
    
    // 復元の場合
    if (isRestore) {
      await restoreArticles();
      return;
    }
    
    // 通常の更新処理
    console.log('🚀 Stack Overflow Blog記事のコンテンツ更新を開始');
    console.log(`📋 設定: ドライラン=${isDryRun}, バッチサイズ=${batchSize}, 要約再生成=${shouldRegenerateSummary}`);
    
    // まずバックアップを取得
    if (!isDryRun) {
      await backupArticles();
    }
    
    // Stack Overflow Blogソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Stack Overflow Blog' }
    });
    
    if (!source) {
      throw new Error('Stack Overflow Blog source not found');
    }
    
    // 更新対象の記事を取得（コンテンツが短い順）
    const articles = await prisma.article.findMany({
      where: { 
        sourceId: source.id,
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📊 対象記事数: ${articles.length}件`);
    
    let successCount = 0;
    let failureCount = 0;
    let skipCount = 0;
    
    // バッチ処理
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, Math.min(i + batchSize, articles.length));
      console.log(`\n📦 バッチ ${Math.floor(i / batchSize) + 1}: ${batch.length}件を処理`);
      
      for (const article of batch) {
        try {
          console.log(`\n🔍 処理中: ${article.title.substring(0, 50)}...`);
          console.log(`   URL: ${article.url}`);
          console.log(`   現在のコンテンツ長: ${article.content?.length || 0}文字`);
          
          // コンテンツが既に十分な場合はスキップ
          if (article.content && article.content.length >= 5000) {
            console.log(`   ⏭️  スキップ: コンテンツ既に十分（${article.content.length}文字）`);
            skipCount++;
            continue;
          }
          
          // エンリッチメント実行
          const enrichedData = await enricher.enrich(article.url);
          
          if (enrichedData && enrichedData.content) {
            const newContentLength = enrichedData.content.length;
            const oldContentLength = article.content?.length || 0;
            
            if (newContentLength > oldContentLength) {
              console.log(`   ✅ エンリッチメント成功: ${oldContentLength} -> ${newContentLength}文字`);
              
              if (!isDryRun) {
                // コンテンツを更新
                await prisma.article.update({
                  where: { id: article.id },
                  data: {
                    content: enrichedData.content,
                    thumbnail: enrichedData.thumbnail || article.thumbnail,
                  }
                });
                
                // 要約を再生成
                if (shouldRegenerateSummary) {
                  console.log(`   🤖 要約を再生成中...`);
                  try {
                    const summaryResult = await summaryService.generate(
                      article.title,
                      enrichedData.content
                    );
                    
                    if (summaryResult.summary && summaryResult.detailedSummary) {
                      await prisma.article.update({
                        where: { id: article.id },
                        data: {
                          summary: summaryResult.summary,
                          detailedSummary: summaryResult.detailedSummary,
                          summaryVersion: 8,
                          articleType: 'unified',
                        }
                      });
                      console.log(`   ✅ 要約再生成完了`);
                    }
                  } catch (summaryError) {
                    console.error(`   ⚠️  要約生成エラー:`, summaryError);
                  }
                }
              }
              
              successCount++;
            } else {
              console.log(`   ⏭️  スキップ: エンリッチメントで改善なし`);
              skipCount++;
            }
          } else {
            console.log(`   ❌ エンリッチメント失敗: コンテンツ取得できず`);
            failureCount++;
          }
          
          // Rate Limit対策（5秒待機）
          await sleep(5000);
          
        } catch (error) {
          console.error(`   ❌ エラー:`, error);
          failureCount++;
        }
      }
      
      // バッチ間の長めの待機（30秒）
      if (i + batchSize < articles.length) {
        console.log(`\n⏳ 次のバッチまで30秒待機...`);
        await sleep(30000);
      }
    }
    
    // 結果サマリー
    console.log('\n' + '='.repeat(60));
    console.log('📊 処理結果サマリー');
    console.log('='.repeat(60));
    console.log(`✅ 成功: ${successCount}件`);
    console.log(`⏭️  スキップ: ${skipCount}件`);
    console.log(`❌ 失敗: ${failureCount}件`);
    console.log(`📊 合計: ${articles.length}件`);
    
    if (isDryRun) {
      console.log('\n⚠️  ドライランモードのため、実際の更新は行われていません');
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// スクリプト実行
main().catch(console.error);