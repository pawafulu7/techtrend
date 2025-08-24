#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticle() {
  const articleId = 'cme162t0a0010te0t0rf06an7';
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        url: true,
        summary: true,
        detailedSummary: true,
        content: true,
        publishedAt: true,
        sourceId: true,
        tags: {
          select: {
            name: true
          }
        }
      }
    });
    
    if (!article) {
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📄 記事情報');
    console.error('='.repeat(80));
    console.error(`ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`URL: ${article.url}`);
    console.error(`公開日: ${article.publishedAt?.toISOString()}`);
    console.error(`ソース: ${article.sourceId}`);
    console.error(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.error('\n📝 要約');
    console.error('-'.repeat(80));
    console.error(article.summary || '(要約なし)');
    
    console.error('\n📋 詳細要約');
    console.error('-'.repeat(80));
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n');
      lines.forEach((line, index) => {
        console.error(`${index + 1}. ${line}`);
      });
      
      // 項目数をチェック
      const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
      console.error(`\n項目数: ${bulletPoints.length}`);
    } else {
      console.error('(詳細要約なし)');
    }
    
    console.error('\n📄 コンテンツ');
    console.error('-'.repeat(80));
    if (article.content) {
      console.error(`コンテンツ長: ${article.content.length}文字`);
      console.error('\n最初の500文字:');
      console.error(article.content.substring(0, 500) + '...');
    } else {
      console.error('(コンテンツなし)');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArticle().catch(console.error);