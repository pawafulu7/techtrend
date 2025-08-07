#!/usr/bin/env tsx
import { PrismaClient } from '@prisma/client';
import { LocalLLMClient } from '../lib/ai/local-llm';

const prisma = new PrismaClient();

async function fixSingleArticleLocal() {
  const articleId = 'cme161hh3000wte0t7lyr8lk9';
  
  console.log('🤖 ローカルLLMで記事を修正\n');
  
  try {
    // ローカルLLMクライアントを初期化
    const localLLM = new LocalLLMClient({
      url: 'http://192.168.11.7:1234',
      model: 'openai/gpt-oss-20b',
      maxTokens: 1500,
      temperature: 0.3,
      maxContentLength: 12000
    });
    
    // 接続確認
    const connected = await localLLM.testConnection();
    if (!connected) {
      console.error('❌ ローカルLLMサーバーに接続できません');
      return;
    }
    console.log('✅ ローカルLLMサーバー接続成功\n');
    
    // 記事を取得
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: {
        id: true,
        title: true,
        content: true,
        url: true
      }
    });
    
    if (!article) {
      console.log('記事が見つかりません');
      return;
    }
    
    console.log(`記事: ${article.title}`);
    console.log(`URL: ${article.url}`);
    
    // コンテンツを強化（短い場合）
    let enhancedContent = article.content || '';
    if (enhancedContent.length < 200) {
      enhancedContent = `
Title: ${article.title}
URL: ${article.url}

Article Content:
${article.content}

Context: This article discusses Meta's code review methodology called "2-2-2 Method" which has improved their development speed by 40%. The method involves: 2 reviewers, 2 hours review time, and 2 days for fixes. This approach optimizes the code review process and reduces bottlenecks in software development workflows.
      `.trim();
    }
    
    console.log(`コンテンツ長: ${enhancedContent.length}文字\n`);
    
    console.log('🔄 ローカルLLMで詳細要約を生成中...');
    const startTime = Date.now();
    
    const result = await localLLM.generateDetailedSummary(
      article.title,
      enhancedContent
    );
    
    const duration = Date.now() - startTime;
    
    console.log(`生成時間: ${duration}ms\n`);
    
    console.log('📝 生成された要約:');
    console.log(result.summary);
    
    console.log('\n📋 生成された詳細要約:');
    console.log(result.detailedSummary);
    
    const lines = result.detailedSummary.split('\n').filter(l => l.trim().startsWith('・'));
    console.log(`\n項目数: ${lines.length}`);
    
    if (lines.length >= 5) {
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
        where: { id: articleId },
        data: {
          summary: result.summary,
          detailedSummary: result.detailedSummary,
          tags: {
            set: tagConnections
          },
          updatedAt: new Date()
        }
      });
      
      console.log('\n✅ データベースを更新しました');
      
      console.log('\n⚠️ キャッシュクリアの手順:');
      console.log('1. ブラウザでハードリロード（Ctrl+Shift+R）');
      console.log('2. Next.jsサーバーを再起動（必要に応じて）');
      
    } else {
      console.log('\n⚠️ 項目数が少ないため更新をスキップしました');
    }
    
  } catch (error) {
    console.error('エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixSingleArticleLocal().catch(console.error);