#!/usr/bin/env npx tsx
/**
 * はてなブックマークフェッチャーのエンリッチメント機能テスト
 */

import { PrismaClient } from '@prisma/client';
import { HatenaExtendedFetcher } from '../../lib/fetchers/hatena-extended';

const prisma = new PrismaClient();

async function testHatenaEnrichment() {
  try {
    // はてなブックマークのソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'はてなブックマーク' }
    });

    if (!source) {
      console.error('はてなブックマークのソースが見つかりません');
      return;
    }

    console.error('はてなブックマークフェッチャーのテストを開始...');
    
    // フェッチャーのインスタンスを作成
    const fetcher = new HatenaExtendedFetcher(source);
    
    // fetch()メソッドを実行（最初の数記事のみテスト）
    console.error('記事の取得とエンリッチメントを実行中...');
    const result = await fetcher.fetch();
    
    // 結果を表示
    console.error(`\n取得した記事数: ${result.articles.length}`);
    console.error(`エラー数: ${result.errors.length}`);
    
    // 最初の3記事のコンテンツ長を表示
    result.articles.slice(0, 3).forEach((article, index) => {
      console.error(`\n記事 ${index + 1}:`);
      console.error(`  タイトル: ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  コンテンツ長: ${article.content?.length || 0} 文字`);
      console.error(`  サムネイル: ${article.thumbnail ? 'あり' : 'なし'}`);
      console.error(`  ブックマーク数: ${article.bookmarks}`);
    });

    // エラーがあれば表示
    if (result.errors.length > 0) {
      console.error('\nエラー:');
      result.errors.forEach(error => {
        console.error(`  - ${error.message}`);
      });
    }

  } catch (error) {
    console.error('テスト実行中にエラーが発生しました:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// テスト実行
testHatenaEnrichment();