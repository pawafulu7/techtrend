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
    
    console.error('=== 記事情報 ===');
    console.error(`タイトル: ${article.title}`);
    console.error(`URL: ${article.url}`);
    console.error(`コンテンツ長: ${article.content?.length}文字`);
    console.error(`現在の要約長: ${article.detailedSummary?.length}文字`);
    console.error(`現在のsummaryVersion: ${article.summaryVersion}`);
    
    if (!article.content) {
      console.error('コンテンツがありません');
      return;
    }
    
    console.error('\n=== 要約再生成実行 ===');
    
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
      console.error('\n=== 生成された詳細要約 ===');
      console.error(result.detailedSummary);
      console.error(`\n要約長: ${result.detailedSummary.length}文字`);
      console.error(`summaryVersion: ${result.summaryVersion}`);
      console.error(`articleType: ${result.articleType}`);
      
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
      
      console.error('\n✅ 要約を更新しました');
      
      // セクションの確認
      const sections = result.detailedSummary.split('\n').filter(line => line.trim());
      console.error(`\nセクション数: ${sections.length}`);
      sections.forEach((section, i) => {
        const hasTitle = section.includes('：') || section.includes(':');
        console.error(`${i + 1}. タイトル付き: ${hasTitle ? 'YES' : 'NO'}`);
        if (hasTitle) {
          const match = section.match(/^[・-]\s*(.+?)[:：]/);
          if (match) {
            console.error(`   タイトル: "${match[1]}"`);
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