#!/usr/bin/env npx tsx
/**
 * エンリッチャーの動作テスト
 * 各ソースから1件ずつ記事を取得してコンテンツが取れるか確認
 */

import { PrismaClient } from '@prisma/client';
import { ContentEnricherFactory } from '../../lib/enrichers';

const prisma = new PrismaClient();

async function testEnrichers() {
  console.error('========================================');
  console.error('エンリッチャー動作テスト');
  console.error('========================================\n');

  const factory = new ContentEnricherFactory();

  // コンテンツが取得できていないソースの記事をテスト
  const testTargets = [
    { sourceName: 'Google AI Blog', limit: 2 },
    { sourceName: 'Google Developers Blog', limit: 2 },
    { sourceName: 'Hugging Face Blog', limit: 2 },
    { sourceName: 'InfoQ Japan', limit: 2 },
    { sourceName: 'Publickey', limit: 2 },
    { sourceName: 'Stack Overflow Blog', limit: 2 },
  ];

  for (const target of testTargets) {
    console.error(`\n【${target.sourceName}】`);
    console.error('----------------------------------------');

    // ソースIDを取得
    const source = await prisma.source.findFirst({
      where: { name: target.sourceName }
    });

    if (!source) {
      console.error('❌ ソースが見つかりません');
      continue;
    }

    // 記事を取得（コンテンツが空または短いもの）
    const articles = await prisma.article.findMany({
      where: {
        sourceId: source.id,
        OR: [
          { content: null },
          { content: '' },
        ]
      },
      take: target.limit,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        url: true,
        content: true,
      }
    });

    if (articles.length === 0) {
      console.error('⚠️ テスト対象の記事がありません');
      continue;
    }

    for (const article of articles) {
      console.error(`\nテスト記事: ${article.title.substring(0, 50)}...`);
      console.error(`URL: ${article.url}`);
      console.error(`現在のコンテンツ: ${article.content?.length || 0}文字`);

      // エンリッチャーを取得
      const enricher = factory.getEnricher(article.url);
      
      if (!enricher) {
        console.error('❌ エンリッチャーが見つかりません');
        continue;
      }

      try {
        console.error('エンリッチ中...');
        const enriched = await enricher.enrich(article.url);
        
        if (enriched && enriched.content) {
          console.error(`✅ 成功: ${enriched.content.length}文字取得`);
          if (enriched.thumbnail) {
            console.error(`   サムネイル: ${enriched.thumbnail.substring(0, 50)}...`);
          }
          
          // 最初の200文字を表示
          console.error(`   内容プレビュー: ${enriched.content.substring(0, 200)}...`);
        } else {
          console.error('❌ コンテンツ取得失敗');
        }
      } catch (error) {
        console.error(`❌ エラー: ${error}`);
      }

      // Rate limit対策
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  await prisma.$disconnect();
}

// 実行
testEnrichers();