#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { cleanSummary, cleanDetailedSummary } from '../lib/utils/summary-cleaner';

const prisma = new PrismaClient();

async function quickFixMetadata() {
  console.log('🔧 メタデータ混入問題を高速修正\n');
  
  try {
    // メタデータ問題のある記事を取得
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { summary: { contains: '要約:' } },
          { summary: { contains: '要約：' } },
          { summary: { contains: '分析:' } },
          { summary: { contains: '分析：' } },
          { summary: { contains: 'tags:' } },
          { summary: { contains: 'Provide' } },
          { summary: { contains: 'plausible details' } },
          { summary: { contains: '詳細要約:' } },
          { summary: { contains: '詳細要約：' } },
          { summary: { contains: '・記事の主題は、' } }
        ]
      },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
        source: { select: { name: true } }
      }
    });
    
    console.log(`📊 メタデータ混入記事: ${articles.length}件\n`);
    
    let fixedCount = 0;
    
    for (const article of articles) {
      let summary = article.summary || '';
      let detailedSummary = article.detailedSummary || '';
      let changed = false;
      
      const originalSummary = summary;
      
      // メタデータを除去
      summary = summary
        // ラベル除去
        .replace(/^.*?要約[:：]\s*/s, '')
        .replace(/^.*?分析[:：]\s*/s, '')
        .replace(/^.*?詳細要約[:：]\s*/s, '')
        .replace(/tags?[:：].*$/gi, '')
        // 英語指示除去
        .replace(/Provide plausible details\.?\s*/gi, '')
        .replace(/Use article content\.?\s*/gi, '')
        .replace(/We need to produce.*?\.?\s*/gi, '')
        // 不要な記号
        .replace(/^[・\s]+/, '')
        .replace(/\s+$/, '');
      
      // 詳細要約が誤って一覧要約に入った場合
      if (summary.startsWith('・記事の主題は')) {
        // 最初の項目だけを抽出して要約化
        const firstItem = summary.split('\n')[0]
          .replace(/^・/, '')
          .replace(/記事の主題は、/, '');
        
        if (firstItem.length >= 60 && firstItem.length <= 120) {
          summary = firstItem;
        } else {
          // タイトルから再構成
          summary = `${article.title}に関する技術的な実装と活用方法`;
        }
        changed = true;
      }
      
      // 標準クリーンアップ
      summary = cleanSummary(summary);
      
      // 詳細要約もクリーンアップ
      if (detailedSummary) {
        detailedSummary = cleanDetailedSummary(detailedSummary);
      }
      
      // 変更があった場合のみ更新
      if (summary !== originalSummary || changed) {
        try {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: summary,
              detailedSummary: detailedSummary,
              updatedAt: new Date()
            }
          });
          
          fixedCount++;
          console.log(`✅ [${fixedCount}/${articles.length}] ${article.title.substring(0, 40)}...`);
          console.log(`   修正前: "${originalSummary.substring(0, 60)}..."`);
          console.log(`   修正後: "${summary.substring(0, 60)}..."`);
        } catch (error) {
          console.error(`❌ 更新エラー (${article.id}):`, error);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ メタデータ修正完了: ${fixedCount}件`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

quickFixMetadata().catch(console.error);