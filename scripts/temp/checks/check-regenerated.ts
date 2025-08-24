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
      console.error('記事が見つかりません');
      return;
    }
    
    console.error('📄 ローカルLLMで再生成された記事');
    console.error('='.repeat(60));
    console.error(`ID: ${article.id}`);
    console.error(`タイトル: ${article.title}`);
    console.error(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.error('\n📝 要約');
    console.error('-'.repeat(60));
    console.error(article.summary);
    
    console.error('\n📋 詳細要約');
    console.error('-'.repeat(60));
    const lines = article.detailedSummary?.split('\n') || [];
    lines.forEach((line, index) => {
      console.error(`${index + 1}. ${line}`);
    });
    
    const bulletPoints = lines.filter(l => l.trim().startsWith('・'));
    console.error(`\n項目数: ${bulletPoints.length} ${bulletPoints.length === 6 ? '✅' : '⚠️'}`);
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRegenerated().catch(console.error);