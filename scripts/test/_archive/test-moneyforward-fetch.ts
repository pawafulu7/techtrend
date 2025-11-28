#!/usr/bin/env -S npx tsx

import { PrismaClient } from '@prisma/client';
import { CorporateTechBlogFetcher } from '../../lib/fetchers/corporate-tech-blog';

const prisma = new PrismaClient();

async function testMoneyForwardFetch() {
  console.error('🔍 マネーフォワード記事取得テスト\n');

  try {
    // Corporate Tech Blogソースを取得または作成
    let source = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' }
    });

    if (!source) {
      source = await prisma.source.create({
        data: {
          name: 'Corporate Tech Blog',
          url: 'https://techblog.example.com',
          type: 'RSS',
          isActive: true
        }
      });
    }

    // フェッチャーを初期化
    const fetcher = new CorporateTechBlogFetcher(source);
    
    // 記事を取得（実際のfetchメソッドを実行）
    console.error('📡 フェッチャーで記事を取得中...\n');
    const result = await fetcher.fetch();
    
    // マネーフォワードの記事をフィルタ
    const moneyforwardArticles = result.articles.filter(article => 
      article.url.includes('moneyforward-dev.jp')
    );

    console.error(`✅ マネーフォワード記事数: ${moneyforwardArticles.length}件\n`);

    if (moneyforwardArticles.length > 0) {
      const article = moneyforwardArticles[0];
      console.error('📄 最初の記事:');
      console.error(`  タイトル: ${article.title}`);
      console.error(`  URL: ${article.url}`);
      console.error(`  コンテンツ長: ${article.content?.length || 0}文字`);
      console.error(`  サムネイル: ${article.thumbnail ? '✅' : '❌'}`);
      console.error(`  タグ: ${article.tagNames?.join(', ')}`);
      
      // タグの詳細確認
      console.error('\n📌 タグの詳細:');
      article.tagNames?.forEach((tag, index) => {
        console.error(`  ${index + 1}. ${tag}`);
      });

      // エンリッチメントが実行されたか確認
      if (article.content && article.content.length > 500) {
        console.error('\n✅ エンリッチメント: 成功（コンテンツが拡張されています）');
      } else {
        console.error('\n❌ エンリッチメント: 失敗または未実行');
      }
    }

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testMoneyForwardFetch();