#!/usr/bin/env tsx
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';
import { PrismaClient } from '@prisma/client';

async function testMoneyForwardFetch() {
  const fetcher = new CorporateTechBlogFetcher();
  const prisma = new PrismaClient();
  
  console.error("=== マネーフォワード記事取得テスト ===");
  console.error(`環境変数 EXCLUDE_EVENT_ARTICLES: ${process.env.EXCLUDE_EVENT_ARTICLES || 'undefined (default: false)'}`);
  console.error(`現在日時: ${new Date().toISOString()}`);
  
  try {
    // 記事を取得
    const articles = await fetcher.fetch();
    
    // マネーフォワードの記事のみフィルタリング
    const moneyForwardArticles = articles.filter((article: any) => 
      article.url.includes('moneyforward-dev.jp')
    );
    
    console.error(`\n取得された記事数: ${articles.length}件`);
    console.error(`マネーフォワードの記事数: ${moneyForwardArticles.length}件`);
    
    // CTF関連記事を探す
    const ctfArticles = moneyForwardArticles.filter((article: any) =>
      article.title.toLowerCase().includes('ctf')
    );
    
    console.error(`\nCTF関連記事: ${ctfArticles.length}件`);
    
    if (ctfArticles.length > 0) {
      console.error("\nCTF関連記事の詳細:");
      ctfArticles.forEach((article: any, index: number) => {
        console.error(`\n[${index + 1}] ${article.title}`);
        console.error(`  URL: ${article.url}`);
        console.error(`  公開日: ${article.publishedAt}`);
        console.error(`  タグ: ${article.tags.join(', ')}`);
        
        // SECCON記事の特別チェック
        if (article.title.includes('SECCON')) {
          console.error(`  ✅ SECCON記事が正常に取得されました！`);
          
          // データベースに存在するか確認
          prisma.article.findFirst({
            where: { url: article.url }
          }).then(existing => {
            if (existing) {
              console.error(`  データベース: 既に存在 (ID: ${existing.id})`);
            } else {
              console.error(`  データベース: 未保存`);
            }
          });
        }
      });
    } else {
      console.error("\n❌ CTF関連記事が取得されていません");
      console.error("考えられる原因:");
      console.error("1. RSSフィードに含まれていない");
      console.error("2. 何らかのフィルタリングで除外されている");
      console.error("3. 取得タイミングの問題");
    }
    
    // 最新のマネーフォワード記事を表示
    if (moneyForwardArticles.length > 0) {
      console.error("\n最新のマネーフォワード記事（5件）:");
      moneyForwardArticles.slice(0, 5).forEach((article: any, index: number) => {
        console.error(`${index + 1}. ${article.title}`);
        console.error(`   ${article.publishedAt}`);
      });
    }
    
  } catch (error) {
    console.error("エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testMoneyForwardFetch().catch(console.error);