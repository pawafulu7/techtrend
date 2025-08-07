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
      console.log('記事が見つかりません');
      return;
    }
    
    console.log('📄 記事情報');
    console.log('='.repeat(80));
    console.log(`ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`公開日: ${article.publishedAt?.toISOString()}`);
    console.log(`ソース: ${article.sourceId}`);
    console.log(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.log('\n📝 要約');
    console.log('-'.repeat(80));
    console.log(article.summary || '(要約なし)');
    
    console.log('\n📋 詳細要約');
    console.log('-'.repeat(80));
    if (article.detailedSummary) {
      const lines = article.detailedSummary.split('\n');
      lines.forEach((line, index) => {
        console.log(`${index + 1}. ${line}`);
      });
      
      // 項目数をチェック
      const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
      console.log(`\n項目数: ${bulletPoints.length}`);
    } else {
      console.log('(詳細要約なし)');
    }
    
    console.log('\n📄 コンテンツ');
    console.log('-'.repeat(80));
    if (article.content) {
      console.log(`コンテンツ長: ${article.content.length}文字`);
      console.log('\n最初の500文字:');
      console.log(article.content.substring(0, 500) + '...');
    } else {
      console.log('(コンテンツなし)');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArticle().catch(console.error);