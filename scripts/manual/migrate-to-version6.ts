#!/usr/bin/env tsx
/**
 * summaryVersion 5から6への移行スクリプト
 * - 詳細要約が不完全な記事を優先的に再生成
 * - maxOutputTokens 2500で高品質な要約生成
 * - 段階的な処理とエラーハンドリング
 */

import { PrismaClient } from '@prisma/client';
import { getContentAwareSummaryService } from '../../lib/ai/content-aware-summary-service';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';
import { checkSummaryQuality } from '../../lib/utils/summary-quality-checker';

const prisma = new PrismaClient();

// コマンドライン引数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
const maxArticles = limit ? parseInt(limit, 10) : undefined;
const priority = args.find(arg => arg.startsWith('--priority='))?.split('=')[1] || 'all';
const continueMode = args.includes('--continue'); // 中断した場合の継続モード

interface ProcessStats {
  totalTargets: number;
  processed: number;
  improved: number;
  unchanged: number;
  failed: number;
  startTime: number;
  detailedSummaryLengths: number[];
}

/**
 * 優先度に基づいて対象記事を取得
 */
async function getTargetArticles(priority: string, limit?: number) {
  let whereCondition = {};
  
  switch (priority) {
    case 'critical':
      // 詳細要約が400文字未満の記事
      whereCondition = {
        OR: [
          { summaryVersion: { lt: 6 } },
          { summaryVersion: null }
        ],
        detailedSummary: { not: null }
      };
      // SQLで文字数フィルタリング
      const criticalArticles = await prisma.$queryRaw`
        SELECT id, title, url, content, sourceId, summary, detailedSummary, summaryVersion
        FROM Article
        WHERE (summaryVersion < 6 OR summaryVersion IS NULL)
        AND detailedSummary IS NOT NULL
        AND LENGTH(detailedSummary) < 400
        ORDER BY publishedAt DESC
        ${limit ? prisma.$queryRaw`LIMIT ${limit}` : prisma.$queryRaw``}
      `;
      return criticalArticles as any[];
      
    case 'substandard':
      // 詳細要約が800文字未満の記事
      const substandardArticles = await prisma.$queryRaw`
        SELECT id, title, url, content, sourceId, summary, detailedSummary, summaryVersion
        FROM Article
        WHERE (summaryVersion < 6 OR summaryVersion IS NULL)
        AND detailedSummary IS NOT NULL
        AND LENGTH(detailedSummary) >= 400
        AND LENGTH(detailedSummary) < 800
        ORDER BY publishedAt DESC
        ${limit ? prisma.$queryRaw`LIMIT ${limit}` : prisma.$queryRaw``}
      `;
      return substandardArticles as any[];
      
    case 'all':
    default:
      // すべてのversion 5以下の記事
      whereCondition = {
        OR: [
          { summaryVersion: { lt: 6 } },
          { summaryVersion: null }
        ]
      };
      return await prisma.article.findMany({
        where: whereCondition,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          url: true,
          content: true,
          sourceId: true,
          summary: true,
          detailedSummary: true,
          summaryVersion: true
        }
      });
  }
}

/**
 * 統計情報を表示
 */
function displayStats(stats: ProcessStats) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const avgTime = stats.processed > 0 ? elapsed / stats.processed : 0;
  
  console.log('\n📊 処理統計:');
  console.log(`  対象記事数: ${stats.totalTargets}`);
  console.log(`  処理済み: ${stats.processed}`);
  console.log(`  改善: ${stats.improved}`);
  console.log(`  変更なし: ${stats.unchanged}`);
  console.log(`  失敗: ${stats.failed}`);
  console.log(`  経過時間: ${elapsed.toFixed(1)}秒`);
  console.log(`  平均処理時間: ${avgTime.toFixed(1)}秒/記事`);
  
  if (stats.detailedSummaryLengths.length > 0) {
    const avgLength = stats.detailedSummaryLengths.reduce((a, b) => a + b, 0) / stats.detailedSummaryLengths.length;
    const minLength = Math.min(...stats.detailedSummaryLengths);
    const maxLength = Math.max(...stats.detailedSummaryLengths);
    console.log(`  詳細要約文字数 - 平均: ${avgLength.toFixed(0)}, 最小: ${minLength}, 最大: ${maxLength}`);
  }
}

async function main() {
  console.log('🚀 summaryVersion 6への移行を開始します');
  console.log(`📋 設定: priority=${priority}, limit=${maxArticles || '無制限'}, dryRun=${isDryRun}`);
  
  if (isDryRun) {
    console.log('⚠️  ドライランモード: 実際の更新は行いません');
  }
  
  const stats: ProcessStats = {
    totalTargets: 0,
    processed: 0,
    improved: 0,
    unchanged: 0,
    failed: 0,
    startTime: Date.now(),
    detailedSummaryLengths: []
  };
  
  try {
    // 対象記事を取得
    const articles = await getTargetArticles(priority, maxArticles);
    stats.totalTargets = articles.length;
    
    if (articles.length === 0) {
      console.log('✅ 処理対象の記事がありません');
      return;
    }
    
    console.log(`📝 ${articles.length}件の記事を処理します`);
    
    // コンテンツ長対応サービスを取得
    const service = getContentAwareSummaryService();
    
    for (const [index, article] of articles.entries()) {
      const progress = `[${index + 1}/${articles.length}]`;
      console.log(`\n${progress} 処理中: ${article.title.substring(0, 50)}...`);
      
      // 現在の品質を確認
      const currentDetailedLength = article.detailedSummary?.length || 0;
      console.log(`  現在の詳細要約: ${currentDetailedLength}文字, version=${article.summaryVersion || 'null'}`);
      
      if (isDryRun) {
        console.log('  [DRY RUN] スキップ');
        stats.processed++;
        continue;
      }
      
      try {
        // コンテンツの準備
        const content = article.content || article.summary || article.title;
        
        // 統一サービスで要約生成
        const result = await service.generate(article.title, content, {
          maxRetries: 3,
          minQualityScore: 60
        });
        
        // 品質確認
        const newDetailedLength = result.detailedSummary?.length || 0;
        stats.detailedSummaryLengths.push(newDetailedLength);
        
        if (newDetailedLength < 800) {
          console.warn(`  ⚠️  詳細要約が基準未満: ${newDetailedLength}文字`);
        }
        
        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: 6,
            updatedAt: new Date()
          }
        });
        
        // タグの更新
        if (result.tags && result.tags.length > 0) {
          // 既存のタグを削除
          await prisma.article.update({
            where: { id: article.id },
            data: { tags: { set: [] } }
          });
          
          // 新しいタグを追加
          for (const tagName of result.tags) {
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
        
        // キャッシュをクリア
        await cacheInvalidator.onArticleUpdated(article.id);
        
        // 統計更新
        if (newDetailedLength > currentDetailedLength) {
          stats.improved++;
          console.log(`  ✅ 改善: ${currentDetailedLength}文字 → ${newDetailedLength}文字`);
        } else {
          stats.unchanged++;
          console.log(`  ➖ 変更なし: ${newDetailedLength}文字`);
        }
        
        stats.processed++;
        
        // API負荷軽減のため間隔を空ける
        if (index < articles.length - 1) {
          const waitTime = 5000; // 5秒
          console.log(`  ⏳ ${waitTime / 1000}秒待機...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        // 100件ごとに長めの休憩
        if (stats.processed % 100 === 0 && index < articles.length - 1) {
          console.log('\n🔄 100件処理完了。30秒の長期待機...');
          displayStats(stats);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
        
      } catch (error) {
        console.error(`  ❌ エラー:`, error instanceof Error ? error.message : error);
        stats.failed++;
        
        // Rate Limitエラーの場合は長めに待機
        if (error instanceof Error && error.message.includes('429')) {
          console.log('  ⚠️  Rate Limit検出。60秒待機...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
      }
    }
    
  } catch (error) {
    console.error('❌ 致命的エラー:', error);
  } finally {
    // 最終統計
    displayStats(stats);
    
    // 残りの記事数を確認
    if (!isDryRun) {
      const remaining = await prisma.article.count({
        where: {
          OR: [
            { summaryVersion: { lt: 6 } },
            { summaryVersion: null }
          ]
        }
      });
      
      if (remaining > 0) {
        console.log(`\n📝 残り${remaining}件の記事がversion 6への移行を待っています`);
        console.log('継続するには以下のコマンドを実行してください:');
        console.log('npm run migrate:version6 -- --continue');
      } else {
        console.log('\n✅ すべての記事がversion 6に移行されました！');
      }
    }
    
    await prisma.$disconnect();
  }
}

// エラーハンドリング
process.on('SIGINT', async () => {
  console.log('\n⚠️  処理を中断しました');
  await prisma.$disconnect();
  process.exit(0);
});

main().catch(async (error) => {
  console.error('❌ エラー:', error);
  await prisma.$disconnect();
  process.exit(1);
});