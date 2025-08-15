/**
 * Stack Overflow記事のエンリッチメント
 */

import { PrismaClient } from '@prisma/client';
import { StackOverflowEnricher } from '../../lib/enrichers/stackoverflow';

const prisma = new PrismaClient();
const enricher = new StackOverflowEnricher();

async function enrichStackOverflowArticle() {
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
    console.log(`現在のコンテンツ長: ${article.content?.length}文字`);
    console.log(`現在のコンテンツ: ${article.content}`);
    
    console.log('\n=== エンリッチメント実行 ===');
    
    const enrichedData = await enricher.enrich(article.url);
    
    if (enrichedData && enrichedData.content) {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          content: enrichedData.content,
          ...(enrichedData.thumbnail && { thumbnail: enrichedData.thumbnail })
        }
      });
      
      console.log(`\n✅ エンリッチメント成功`);
      console.log(`新しいコンテンツ長: ${enrichedData.content.length}文字`);
      console.log(`コンテンツプレビュー: ${enrichedData.content.substring(0, 200)}...`);
    } else {
      console.error('エンリッチメント失敗');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

enrichStackOverflowArticle().catch(console.error);