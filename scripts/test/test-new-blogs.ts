#!/usr/bin/env -S npx tsx

/**
 * 新規追加企業ブログのテストスクリプト
 */

import { PrismaClient } from '@prisma/client';
import { CorporateTechBlogFetcher } from '../../lib/fetchers/corporate-tech-blog';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();

async function testNewBlogs() {
  console.error('🔍 新規追加企業ブログのテスト開始...\n');

  try {
    // Sourceが存在することを確認
    const source = await prisma.source.findUnique({
      where: { name: 'Corporate Tech Blog' }
    });

    if (!source) {
      console.error('❌ Source "Corporate Tech Blog" が見つかりません');
      return;
    }

    // フェッチャーのインスタンス化
    const fetcher = new CorporateTechBlogFetcher(source);
    const enricherFactory = new ContentEnricherFactory();

    console.error('📡 記事を取得中...');
    const articles = await fetcher.fetch();

    // 新規追加企業の記事をフィルタ
    const newCompanies = ['ZOZO', 'リクルート', 'はてなDeveloper', 'GMOペパボ', 'Sansan'];
    const newCompanyArticles = articles.filter(article => {
      const tags = article.tags || [];
      return newCompanies.some(company => tags.includes(company));
    });

    console.error(`\n✅ 取得結果:`);
    console.error(`- 全記事数: ${articles.length}`);
    console.error(`- 新規企業の記事数: ${newCompanyArticles.length}\n`);

    // 各企業の記事数をカウント
    const companyCounts: Record<string, number> = {};
    newCompanyArticles.forEach(article => {
      const tags = article.tags || [];
      newCompanies.forEach(company => {
        if (tags.includes(company)) {
          companyCounts[company] = (companyCounts[company] || 0) + 1;
        }
      });
    });

    console.error('📊 企業別記事数:');
    newCompanies.forEach(company => {
      const count = companyCounts[company] || 0;
      const status = count > 0 ? '✅' : '❌';
      console.error(`${status} ${company}: ${count}件`);
    });

    // 各企業の最初の記事を表示
    console.error('\n📝 各企業の最初の記事:');
    for (const company of newCompanies) {
      const article = newCompanyArticles.find(a => a.tags?.includes(company));
      if (article) {
        console.error(`\n[${company}]`);
        console.error(`- タイトル: ${article.title}`);
        console.error(`- URL: ${article.url}`);
        console.error(`- コンテンツ長: ${article.content?.length || 0}文字`);
        
        // エンリッチャーの確認
        if (article.url) {
          const enricher = enricherFactory.getEnricher(article.url);
          if (enricher) {
            console.error(`- エンリッチャー: ${enricher.constructor.name}`);
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// メイン実行
testNewBlogs().catch(console.error);