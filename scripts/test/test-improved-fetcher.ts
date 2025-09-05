#!/usr/bin/env tsx
import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';
import { PrismaClient } from '@prisma/client';

async function testImprovedFetcher() {
  const fetcher = new CorporateTechBlogFetcher();
  const prisma = new PrismaClient();
  
  console.error("=== Corporate Tech Blog Fetcher 改善版テスト ===");
  console.error(`環境変数 EXCLUDE_EVENT_ARTICLES: ${process.env.EXCLUDE_EVENT_ARTICLES || 'undefined (default: false)'}`);
  console.error(`環境変数 MAX_ARTICLES_PER_COMPANY: ${process.env.MAX_ARTICLES_PER_COMPANY || 'undefined (default: 30)'}`);
  console.error(`現在日時: ${new Date().toISOString()}`);
  console.error("");
  
  try {
    const startTime = Date.now();
    
    // 記事を取得
    const result = await fetcher.fetch();
    
    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) / 1000;
    
    console.error("\n=== 取得結果サマリー ===");
    console.error(`処理時間: ${elapsedTime.toFixed(2)}秒`);
    console.error(`取得された記事総数: ${result.articles.length}件`);
    console.error(`エラー数: ${result.errors.length}件`);
    
    // 企業別の記事数を集計
    const articlesByCompany = new Map<string, number>();
    const ctfArticles: any[] = [];
    const englishTitleJapaneseArticles: any[] = [];
    
    for (const article of result.articles) {
      // 企業名タグ（最初のタグ）で集計
      const companyTag = article.tagNames[0];
      articlesByCompany.set(companyTag, (articlesByCompany.get(companyTag) || 0) + 1);
      
      // CTF関連記事を検出
      if (article.title.toLowerCase().includes('ctf')) {
        ctfArticles.push(article);
      }
      
      // 英数字タイトルの日本語記事を検出
      const hasJapaneseInTitle = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(article.title);
      const hasJapaneseInContent = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(article.content || '');
      if (!hasJapaneseInTitle && hasJapaneseInContent) {
        englishTitleJapaneseArticles.push(article);
      }
    }
    
    console.error("\n=== 企業別記事数 ===");
    for (const [company, count] of articlesByCompany.entries()) {
      console.error(`${company}: ${count}件`);
    }
    
    // マネーフォワードの記事を詳しく表示
    const moneyForwardArticles = result.articles.filter(article => 
      article.url.includes('moneyforward-dev.jp')
    );
    
    console.error(`\n=== マネーフォワードの記事 (${moneyForwardArticles.length}件) ===`);
    moneyForwardArticles.forEach((article, index) => {
      console.error(`[${index + 1}] ${article.title}`);
      console.error(`    URL: ${article.url}`);
      console.error(`    公開日: ${article.publishedAt}`);
      
      // SECCON記事の特別確認
      if (article.title.includes('SECCON')) {
        console.error(`    ✅ SECCON記事が正常に取得されました！`);
      }
    });
    
    // CTF関連記事の確認
    if (ctfArticles.length > 0) {
      console.error(`\n=== CTF関連記事 (${ctfArticles.length}件) ===`);
      ctfArticles.forEach((article, index) => {
        console.error(`[${index + 1}] ${article.title}`);
        console.error(`    企業: ${article.tagNames[0]}`);
        console.error(`    URL: ${article.url}`);
      });
    }
    
    // 英数字タイトルの日本語記事
    if (englishTitleJapaneseArticles.length > 0) {
      console.error(`\n=== 英数字タイトルの日本語記事 (${englishTitleJapaneseArticles.length}件) ===`);
      console.error("（改善により正しく取得されるようになった記事）");
      englishTitleJapaneseArticles.forEach((article, index) => {
        console.error(`[${index + 1}] ${article.title}`);
        console.error(`    企業: ${article.tagNames[0]}`);
      });
    }
    
    // 日付範囲の確認
    const dates = result.articles.map(a => a.publishedAt).sort();
    if (dates.length > 0) {
      const oldestDate = dates[0];
      const newestDate = dates[dates.length - 1];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      console.error("\n=== 日付範囲 ===");
      console.error(`最古の記事: ${oldestDate}`);
      console.error(`最新の記事: ${newestDate}`);
      console.error(`30日前: ${thirtyDaysAgo.toISOString()}`);
      
      const oldArticles = result.articles.filter(a => a.publishedAt < thirtyDaysAgo);
      if (oldArticles.length > 0) {
        console.error(`⚠️ 30日より古い記事が ${oldArticles.length}件含まれています`);
      } else {
        console.error(`✅ すべての記事が30日以内です`);
      }
    }
    
    // エラーの表示
    if (result.errors.length > 0) {
      console.error("\n=== エラー ===");
      result.errors.forEach((error, index) => {
        console.error(`[${index + 1}] ${error.message}`);
      });
    }
    
    // データベースへの保存はテスト時は行わない
    console.error("\n注意: これはテスト実行のため、データベースへの保存は行いません");
    
  } catch (error) {
    console.error("エラー:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testImprovedFetcher().catch(console.error);