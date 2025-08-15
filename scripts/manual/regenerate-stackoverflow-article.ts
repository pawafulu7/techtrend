/**
 * Stack Overflow記事の要約を再生成
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

async function regenerateSummary() {
  const articleId = 'cme76kywt000htewxsunxwycq';
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { source: true }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.log('=== 記事情報 ===');
    console.log(`タイトル: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`コンテンツ長: ${article.content?.length}文字`);
    console.log(`現在の要約長: ${article.detailedSummary?.length}文字`);
    console.log(`現在のsummaryVersion: ${article.summaryVersion}`);
    
    if (!article.content) {
      console.error('コンテンツがありません');
      return;
    }
    
    console.log('\n=== 要約再生成実行 ===');
    
    const result = await summaryService.generate(
      article.title,
      article.content,
      undefined,
      {
        sourceName: article.source.name,
        url: article.url
      }
    );
    
    if (result) {
      // 詳細要約の形式を確認
      console.log('\n=== 生成された詳細要約 ===');
      console.log(result.detailedSummary);
      console.log(`\n要約長: ${result.detailedSummary.length}文字`);
      console.log(`summaryVersion: ${result.summaryVersion}`);
      console.log(`articleType: ${result.articleType}`);
      
      // データベース更新
      await prisma.article.update({
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          summaryVersion: result.summaryVersion,
          articleType: result.articleType
        }
      });
      
      console.log('\n✅ 要約を更新しました');
      
      // セクションの確認
      const sections = result.detailedSummary.split('\n').filter(line => line.trim());
      console.log(`\nセクション数: ${sections.length}`);
      sections.forEach((section, i) => {
        const hasTitle = section.includes('：') || section.includes(':');
        console.log(`${i + 1}. タイトル付き: ${hasTitle ? 'YES' : 'NO'}`);
        if (hasTitle) {
          const match = section.match(/^[・-]\s*(.+?)[:：]/);
          if (match) {
            console.log(`   タイトル: "${match[1]}"`);
          }
        }
      });
      
    } else {
      console.error('要約生成失敗');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

regenerateSummary().catch(console.error);