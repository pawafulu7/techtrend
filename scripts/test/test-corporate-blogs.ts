#!/usr/bin/env -S npx tsx

/**
 * 企業技術ブログ記事取得テスト
 */

import { PrismaClient } from '@prisma/client';
import { CorporateTechBlogFetcher } from '../../lib/fetchers/corporate-tech-blog';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();

async function testCorporateBlogs() {
  console.error('🔍 企業技術ブログ記事取得テスト\n');

  try {
    // Sourceを取得または作成
    let source = await prisma.source.findUnique({
      where: { name: 'Corporate Tech Blog' }
    });

    if (!source) {
      source = await prisma.source.create({
        data: {
          name: 'Corporate Tech Blog',
          url: 'https://example.com',
          type: 'RSS',
          isActive: true
        }
      });
    }

    const fetcher = new CorporateTechBlogFetcher(source);
    const enricherFactory = new ContentEnricherFactory();
    
    // 新規5社のテスト対象
    const targetCompanies = ['ZOZO', 'リクルート', 'はてなDeveloper', 'GMOペパボ', 'Sansan'];
    
    console.error('📡 記事取得開始（最大10秒）...\n');
    
    // タイムアウト設定付きで記事取得
    const fetchPromise = fetcher.fetch();
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout')), 10000);
    });
    
    let articles;
    try {
      articles = await Promise.race([fetchPromise, timeoutPromise]) as any[];
      // 成功した場合はタイマーをクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // エラーの場合もタイマーをクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (error instanceof Error && error.message === 'Timeout') {
        console.error('⏱️ タイムアウト（10秒）しましたが、部分的な結果を確認します\n');
        articles = [];
      } else {
        throw error;
      }
    }
    
    // 各企業の記事を確認
    const results: Record<string, any> = {};
    
    for (const company of targetCompanies) {
      const companyArticles = articles.filter(a => 
        a.tags?.includes(company)
      );
      
      results[company] = {
        count: companyArticles.length,
        sample: companyArticles[0] || null,
        enricherAvailable: false
      };
      
      // エンリッチャーの確認
      if (companyArticles[0]?.url) {
        const enricher = enricherFactory.getEnricher(companyArticles[0].url);
        results[company].enricherAvailable = !!enricher;
        results[company].enricherName = enricher?.constructor.name || 'N/A';
      }
    }
    
    // 結果表示
    console.error('\n📊 テスト結果:\n');
    console.error('企業名\t\t記事数\tEnricher\tステータス');
    console.error('─'.repeat(60));
    
    for (const [company, data] of Object.entries(results)) {
      const status = data.count > 0 ? '✅' : '❌';
      const padded = company.padEnd(15);
      console.error(`${padded}\t${data.count}\t${data.enricherAvailable ? '✅' : '❌'}\t${status}`);
    }
    
    // 詳細情報
    console.error('\n📝 詳細情報:\n');
    for (const [company, data] of Object.entries(results)) {
      if (data.sample) {
        console.error(`[${company}]`);
        console.error(`  タイトル: ${data.sample.title?.substring(0, 50)}...`);
        console.error(`  URL: ${data.sample.url}`);
        console.error(`  Enricher: ${data.enricherName}`);
        console.error(`  コンテンツ長: ${data.sample.content?.length || 0}文字\n`);
      }
    }
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testCorporateBlogs().catch(console.error);