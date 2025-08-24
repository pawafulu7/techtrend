#!/usr/bin/env tsx
/**
 * コンテンツが短い記事の詳細要約を修正するスクリプト
 * - 200文字未満: 詳細要約を削除
 * - 200-500文字: 簡略版に再生成
 * - 500文字以上: 通常処理
 */

import { PrismaClient } from '@prisma/client';
import { getContentAwareSummaryService } from '../../lib/ai/content-aware-summary-service';
import { cacheInvalidator } from '../../lib/cache/cache-invalidator';

const prisma = new PrismaClient();

// コマンドライン引数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
const maxArticles = limit ? parseInt(limit, 10) : undefined;

interface ProcessStats {
  veryShort: number;
  short: number;
  medium: number;
  processed: number;
  failed: number;
}

async function main() {
  console.error('🔧 コンテンツが短い記事の詳細要約を修正します');
  console.error(`📋 設定: dryRun=${isDryRun}, limit=${maxArticles || '無制限'}`);
  
  if (isDryRun) {
    console.error('⚠️  ドライランモード: 実際の更新は行いません');
  }
  
  const stats: ProcessStats = {
    veryShort: 0,
    short: 0,
    medium: 0,
    processed: 0,
    failed: 0
  };
  
  try {
    // コンテンツが短い記事を取得（1000文字未満）
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { content: { not: null } },
          { summary: { not: null } }
        ]
      },
      orderBy: { publishedAt: 'desc' },
      take: maxArticles,
      select: {
        id: true,
        title: true,
        content: true,
        summary: true,
        detailedSummary: true,
        sourceId: true
      }
    });
    
    // コンテンツ長でフィルタリング
    const shortContentArticles = articles.filter(article => {
      const content = article.content || article.summary || '';
      return content.length < 1000;
    });
    
    console.error(`📝 ${shortContentArticles.length}件の短いコンテンツ記事を処理します`);
    
    const service = getContentAwareSummaryService();
    
    for (const [index, article] of shortContentArticles.entries()) {
      const content = article.content || article.summary || '';
      const contentLength = content.length;
      const progress = `[${index + 1}/${shortContentArticles.length}]`;
      
      console.error(`\n${progress} 処理中: ${article.title.substring(0, 50)}...`);
      console.error(`  コンテンツ長: ${contentLength}文字`);
      
      if (isDryRun) {
        if (contentLength < 200) {
          console.error('  [DRY RUN] 詳細要約を削除予定');
          stats.veryShort++;
        } else if (contentLength < 500) {
          console.error('  [DRY RUN] 簡略版に再生成予定');
          stats.short++;
        } else {
          console.error('  [DRY RUN] 通常再生成予定');
          stats.medium++;
        }
        stats.processed++;
        continue;
      }
      
      try {
        if (contentLength < 200) {
          // 非常に短い: 詳細要約を削除
          await prisma.article.update({
            where: { id: article.id },
            data: {
              detailedSummary: 'この記事は内容が限定的なため、詳細な要約を提供できません。元記事をご確認ください。',
              summaryVersion: 6,
              updatedAt: new Date()
            }
          });
          
          console.error('  ✅ 詳細要約を削除');
          stats.veryShort++;
          
        } else {
          // 再生成
          const result = await service.generate(article.title, content, {
            maxRetries: 2,
            minQualityScore: 30  // 短いコンテンツは基準を緩める
          });
          
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
            await prisma.article.update({
              where: { id: article.id },
              data: { tags: { set: [] } }
            });
            
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
          
          if (contentLength < 500) {
            console.error('  ✅ 簡略版に再生成');
            stats.short++;
          } else {
            console.error('  ✅ 通常再生成');
            stats.medium++;
          }
        }
        
        // キャッシュをクリア
        await cacheInvalidator.onArticleUpdated(article.id);
        
        stats.processed++;
        
        // API負荷軽減
        if (index < shortContentArticles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
      } catch (error) {
        console.error(`  ❌ エラー:`, error instanceof Error ? error.message : error);
        stats.failed++;
      }
    }
    
  } catch (error) {
    console.error('❌ 致命的エラー:', error);
  } finally {
    // 統計表示
    console.error('\n📊 処理統計:');
    console.error(`  非常に短い（<200文字）: ${stats.veryShort}件`);
    console.error(`  短い（200-500文字）: ${stats.short}件`);
    console.error(`  中程度（500-1000文字）: ${stats.medium}件`);
    console.error(`  処理済み: ${stats.processed}件`);
    console.error(`  失敗: ${stats.failed}件`);
    
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error('❌ エラー:', error);
  await prisma.$disconnect();
  process.exit(1);
});