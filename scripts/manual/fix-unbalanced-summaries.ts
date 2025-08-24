/**
 * コンテンツ長と詳細要約のバランスが悪い記事を修正
 */

import { PrismaClient } from '@prisma/client';
import { UnifiedSummaryService } from '../../lib/ai/unified-summary-service';

const prisma = new PrismaClient();
const summaryService = new UnifiedSummaryService();

interface UnbalancedArticle {
  id: string;
  title: string;
  content: string;
  contentLength: number;
  summaryLength: number;
  expectedMinLength: number;
  source: {
    name: string;
  };
}

async function findUnbalancedArticles(): Promise<UnbalancedArticle[]> {
  console.error('=== 不適切な要約を持つ記事を検索中 ===');
  
  const articles = await prisma.article.findMany({
    where: {
      content: { not: null },
      detailedSummary: { not: null },
      NOT: {
        detailedSummary: { contains: '__SKIP' }
      }
    },
    include: {
      source: true
    }
  });
  
  const unbalanced: UnbalancedArticle[] = [];
  
  for (const article of articles) {
    if (!article.content || !article.detailedSummary) continue;
    
    const contentLen = article.content.length;
    const summaryLen = article.detailedSummary.length;
    let expectedMin = 0;
    
    // 基準に基づいて最小要約長を計算
    if (contentLen >= 5000) {
      expectedMin = 800;
    } else if (contentLen >= 3000) {
      expectedMin = 600;
    } else if (contentLen >= 1000) {
      expectedMin = 400;
    } else if (contentLen >= 500) {
      expectedMin = 300;
    } else {
      continue; // 500文字未満はスキップ
    }
    
    if (summaryLen < expectedMin) {
      unbalanced.push({
        id: article.id,
        title: article.title,
        content: article.content,
        contentLength: contentLen,
        summaryLength: summaryLen,
        expectedMinLength: expectedMin,
        source: { name: article.source.name }
      });
    }
  }
  
  return unbalanced.sort((a, b) => b.contentLength - a.contentLength);
}

async function regenerateSummaries(articles: UnbalancedArticle[]) {
  console.error(`\n=== ${articles.length}件の記事の要約を再生成 ===\n`);
  
  let successCount = 0;
  let failedCount = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.error(`[${i + 1}/${articles.length}] ${article.title.substring(0, 50)}...`);
    console.error(`  ソース: ${article.source.name}`);
    console.error(`  コンテンツ: ${article.contentLength}文字`);
    console.error(`  現在の要約: ${article.summaryLength}文字 (最小: ${article.expectedMinLength}文字)`);
    
    try {
      const result = await summaryService.generate(
        article.title,
        article.content,
        undefined,
        {
          sourceName: article.source.name,
          url: ''
        }
      );
      
      if (result && result.detailedSummary.length >= article.expectedMinLength) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            summaryVersion: result.summaryVersion,
            articleType: result.articleType
          }
        });
        
        console.error(`  ✅ 再生成成功: ${result.detailedSummary.length}文字`);
        successCount++;
      } else if (result) {
        console.error(`  ⚠️ 再生成したが基準未満: ${result.detailedSummary.length}文字`);
        failedCount++;
      } else {
        console.error(`  ❌ 生成失敗`);
        failedCount++;
      }
      
      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ エラー: ${errorMsg}`);
      errors.push(`${article.id}: ${errorMsg}`);
      failedCount++;
      
      // Rate limitエラーの場合は長めに待機
      if (errorMsg.includes('429') || errorMsg.includes('503')) {
        console.error('  ⏳ Rate limit検出。60秒待機...');
        await new Promise(resolve => setTimeout(resolve, 60000));
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // 10件ごとに進捗報告
    if ((i + 1) % 10 === 0) {
      console.error(`\n--- 進捗: ${i + 1}/${articles.length}件完了 (成功: ${successCount}, 失敗: ${failedCount}) ---\n`);
    }
  }
  
  console.error('\n=== 処理完了 ===');
  console.error(`成功: ${successCount}件`);
  console.error(`失敗: ${failedCount}件`);
  
  if (errors.length > 0) {
    console.error('\n=== エラー詳細 ===');
    errors.slice(0, 10).forEach(err => console.error(err));
    if (errors.length > 10) {
      console.error(`... 他 ${errors.length - 10}件のエラー`);
    }
  }
}

async function main() {
  try {
    const unbalanced = await findUnbalancedArticles();
    
    if (unbalanced.length === 0) {
      console.error('不適切な要約を持つ記事はありません');
      return;
    }
    
    console.error(`\n不適切な要約を持つ記事: ${unbalanced.length}件`);
    console.error('\n--- トップ10 ---');
    unbalanced.slice(0, 10).forEach((article, i) => {
      console.error(`${i + 1}. ${article.title.substring(0, 50)}...`);
      console.error(`   ${article.contentLength}文字 → ${article.summaryLength}文字 (最小: ${article.expectedMinLength}文字)`);
    });
    
    // 確認プロンプト
    console.error('\n再生成を開始しますか？ (Ctrl+Cでキャンセル)');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    await regenerateSummaries(unbalanced);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);