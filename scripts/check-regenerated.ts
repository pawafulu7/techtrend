#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkRegenerated() {
  const articleId = 'cmds24nuy0049teo6vo3y5v90';
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        summary: true,
        detailedSummary: true,
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
    
    console.log('📄 ローカルLLMで再生成された記事');
    console.log('='.repeat(60));
    console.log(`ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.log('\n📝 要約');
    console.log('-'.repeat(60));
    console.log(article.summary);
    
    console.log('\n📋 詳細要約');
    console.log('-'.repeat(60));
    const lines = article.detailedSummary?.split('\n') || [];
    lines.forEach((line, index) => {
      console.log(`${index + 1}. ${line}`);
    });
    
    const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
    console.log(`\n項目数: ${bulletPoints.length} ${bulletPoints.length === 6 ? '✅' : '⚠️'}`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRegenerated().catch(console.error);