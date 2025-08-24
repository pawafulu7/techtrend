#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { AIService } from '../lib/ai/ai-service';

const prisma = new PrismaClient();

async function fixShortContentArticles() {
  console.error('🔍 コンテンツが短い記事の詳細要約を修正中...\n');
  
  try {
    const aiService = AIService.fromEnv();
    
    // コンテンツが短い記事を取得（500文字以下）
    const shortArticles = await prisma.article.findMany({
      where: {
        AND: [
          {
            content: {
              not: null
            }
          },
          {
            publishedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7日以内
            }
          }
        ]
      },
      select: {
        id: true,
        title: true,
        content: true,
        url: true,
        detailedSummary: true
      }
    });
    
    // コンテンツが短い記事をフィルタリング
    const problemArticles = shortArticles.filter(article => {
      if (!article.content) return false;
      const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
      return article.content.length < 500 && lines.length < 6;
    });
    
    console.error(`短いコンテンツで問題のある記事: ${problemArticles.length}件\n`);
    
    for (const article of problemArticles) {
      console.error(`処理中: ${article.id}`);
      console.error(`タイトル: ${article.title?.substring(0, 60)}...`);
      console.error(`コンテンツ長: ${article.content?.length}文字`);
      console.error(`URL: ${article.url}`);
      
      // URLから記事タイプを推測
      const isNewsArticle = article.url?.includes('nikkei.com') || 
                           article.url?.includes('itmedia.co.jp') ||
                           article.url?.includes('publickey') ||
                           article.title?.includes('新聞');
      
      const isAWSRelease = article.url?.includes('aws.amazon.com');
      
      if (!article.content) continue;
      
      // コンテンツを補強
      let enhancedContent = article.content;
      if (isNewsArticle) {
        enhancedContent = `
ニュース記事: ${article.title}
URL: ${article.url}

${article.content}

記事タイプ: ニュース・速報
カテゴリ: テクノロジーニュース
        `.trim();
      } else if (isAWSRelease) {
        enhancedContent = `
AWS製品リリース: ${article.title}
URL: ${article.url}

${article.content}

記事タイプ: クラウドサービスリリース
カテゴリ: AWS, クラウドインフラ
        `.trim();
      }
      
      try {
        // 拡張コンテンツで詳細要約を生成
        const result = await aiService.generateDetailedSummary(
          article.title || '',
          enhancedContent
        );
        
        // タグを準備
        const tagConnections = await Promise.all(
          result.tags.map(async (tagName) => {
            const tag = await prisma.tag.upsert({
              where: { name: tagName },
              update: {},
              create: { 
                name: tagName, 
                category: null 
              }
            });
            return { id: tag.id };
          })
        );
        
        // データベースを更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            summary: result.summary,
            detailedSummary: result.detailedSummary,
            tags: {
              set: tagConnections
            },
            updatedAt: new Date()
          }
        });
        
        const newLines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
        console.error(`✅ 再生成完了 - 項目数: ${newLines.length}`);
        
      } catch (error) {
        console.error(`❌ エラー: ${error}`);
      }
      
      console.error('-'.repeat(60));
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.error('\n修正完了');
    
  } catch (error) {
    console.error('致命的エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixShortContentArticles().catch(console.error);