#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { CorporateTechBlogFetcher } from '../../lib/fetchers/corporate-tech-blog';

const prisma = new PrismaClient();

async function testMoneyForwardIntegration() {
  console.error('🔍 マネーフォワード統合テスト開始\n');

  try {
    // 1. Corporate Tech Blogソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' }
    });

    if (!source) {
      throw new Error('Corporate Tech Blogソースが見つかりません');
    }

    // 2. フェッチャーを初期化
    const fetcher = new CorporateTechBlogFetcher(source);
    
    // 3. 記事を取得
    console.error('📡 記事を取得中...\n');
    const result = await fetcher.fetch();
    
    // 4. マネーフォワードの記事をフィルタ
    const moneyforwardArticles = result.articles.filter(article => 
      article.url.includes('moneyforward-dev.jp')
    );

    console.error(`✅ 全記事数: ${result.articles.length}件`);
    console.error(`✅ マネーフォワード記事数: ${moneyforwardArticles.length}件\n`);

    if (moneyforwardArticles.length > 0) {
      console.error('📄 マネーフォワード記事サンプル:');
      for (let i = 0; i < Math.min(3, moneyforwardArticles.length); i++) {
        const article = moneyforwardArticles[i];
        console.error(`\n${i + 1}. ${article.title}`);
        console.error(`   URL: ${article.url}`);
        console.error(`   タグ: ${article.tagNames?.join(', ')}`);
        console.error(`   コンテンツ長: ${article.content?.length || 0}文字`);
        console.error(`   サムネイル: ${article.thumbnail ? '✅' : '❌'}`);
        
        // 企業名タグが含まれているか確認
        const hasCompanyTag = article.tagNames?.includes('マネーフォワード');
        console.error(`   企業名タグ: ${hasCompanyTag ? '✅ マネーフォワード' : '❌'}`);
      }
    }

    // 5. エラー確認
    if (result.errors.length > 0) {
      console.error('\n⚠️ エラー:');
      result.errors.forEach(error => {
        if (error.message.includes('マネーフォワード')) {
          console.error(`   - ${error.message}`);
        }
      });
    }

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMoneyForwardIntegration();