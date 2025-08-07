#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkArticleDetail() {
  const articleId = 'cme161hh3000wte0t7lyr8lk9';
  
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
    
    console.log('📄 記事詳細');
    console.log('='.repeat(80));
    console.log(`ID: ${article.id}`);
    console.log(`タイトル: ${article.title}`);
    console.log(`URL: ${article.url}`);
    console.log(`公開日: ${article.publishedAt?.toISOString()}`);
    console.log(`タグ: ${article.tags.map(t => t.name).join(', ')}`);
    
    console.log('\n📝 要約');
    console.log('-'.repeat(80));
    console.log(article.summary);
    
    console.log('\n📋 詳細要約（生データ）');
    console.log('-'.repeat(80));
    console.log(article.detailedSummary);
    
    console.log('\n📄 コンテンツ');
    console.log('-'.repeat(80));
    if (article.content) {
      console.log(`コンテンツ長: ${article.content.length}文字`);
      console.log('\n内容:');
      console.log(article.content);
    } else {
      console.log('(コンテンツなし)');
    }
    
    // 問題の分析
    console.log('\n🔍 問題分析');
    console.log('-'.repeat(80));
    
    // 要約に含まれる問題パターンをチェック
    const issues = [];
    
    if (article.summary?.includes('**')) {
      issues.push('要約にMarkdown記法が含まれている');
    }
    
    if (article.summary?.includes('## ')) {
      issues.push('要約に見出し記法が含まれている');
    }
    
    if (article.detailedSummary?.includes('**要約:**')) {
      issues.push('詳細要約に要約ラベルが重複している');
    }
    
    if (article.detailedSummary?.includes('## ')) {
      issues.push('詳細要約に見出し記法が含まれている');
    }
    
    const lines = article.detailedSummary?.split('\n').filter(l => l.trim().startsWith('・')) || [];
    if (lines.length < 6) {
      issues.push(`詳細要約が${lines.length}項目しかない（6項目必要）`);
    }
    
    if (issues.length > 0) {
      console.log('❌ 発見された問題:');
      issues.forEach(issue => console.log(`  ・${issue}`));
    } else {
      console.log('✅ 形式的な問題は見つかりませんでした');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArticleDetail().catch(console.error);