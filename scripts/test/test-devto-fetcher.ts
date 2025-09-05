#!/usr/bin/env npx tsx

/**
 * Dev.toフェッチャーの動作テスト
 * 改修後の個別記事詳細取得機能を確認
 */

import { PrismaClient } from '@prisma/client';
import { DevToFetcher } from '../../lib/fetchers/devto';

const prisma = new PrismaClient();

async function main() {
  console.error('🚀 Dev.toフェッチャー動作テスト');
  console.error('================================\n');

  try {
    // Dev.toソースを取得
    const devtoSource = await prisma.source.findFirst({
      where: { name: 'Dev.to' }
    });

    if (!devtoSource) {
      console.error('❌ Dev.toソースが見つかりません');
      return;
    }

    // フェッチャーのインスタンスを作成
    const fetcher = new DevToFetcher(devtoSource);
    
    console.error('📡 Dev.toから記事を取得中...\n');
    
    // 記事を取得（最初の3件のみ詳細確認）
    const result = await fetcher.fetch();
    
    if (result.errors.length > 0) {
      console.error('⚠️ エラーが発生しました:');
      result.errors.forEach(error => {
        console.error(`  - ${error.message}`);
      });
      console.error('');
    }
    
    console.error(`✅ 取得記事数: ${result.articles.length}件\n`);
    
    // 最初の3件の詳細を表示
    const articlesToShow = Math.min(3, result.articles.length);
    for (let i = 0; i < articlesToShow; i++) {
      const article = result.articles[i];
      console.error(`[${i + 1}] ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  タグ: ${Array.isArray(article.tagNames) ? article.tagNames.join(', ') : 'なし'}`);
      console.error(`  ブックマーク: ${article.bookmarks}`);
      console.error(`  コンテンツ長: ${article.content?.length || 0}文字`);
      
      // HTMLタグがあるか確認（本文が取得できているか）
      const hasHtmlContent = article.content?.includes('<') && article.content?.includes('>');
      console.error(`  HTML本文: ${hasHtmlContent ? '✅ あり' : '❌ なし（descriptionのみ）'}`);
      
      // 最初の100文字を表示
      if (article.content && article.content.length > 0) {
        const preview = article.content.substring(0, 100).replace(/\n/g, ' ');
        console.error(`  プレビュー: ${preview}...`);
      }
      console.error('');
    }
    
    // 統計情報
    const contentLengths = result.articles.map(a => a.content?.length || 0);
    const avgLength = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
    const htmlArticles = result.articles.filter(a => 
      a.content?.includes('<') && a.content?.includes('>')
    ).length;
    
    console.error('📊 統計情報:');
    console.error(`  平均コンテンツ長: ${avgLength}文字`);
    console.error(`  HTML本文あり: ${htmlArticles}/${result.articles.length}件`);
    console.error(`  HTML本文取得率: ${Math.round(htmlArticles / result.articles.length * 100)}%`);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});