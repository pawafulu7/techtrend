#!/usr/bin/env npx tsx

import { DevToFetcher } from '../lib/fetchers/devto';
import { prisma } from '../lib/database';
import { Source } from '@prisma/client';

async function testDevToFetchAndSave() {
  console.error('=== Dev.to フェッチャー統合テスト ===\n');

  try {
    // Dev.toソースを取得または作成
    let devtoSource = await prisma.source.findFirst({
      where: { name: 'Dev.to' }
    });

    if (!devtoSource) {
      console.error('Dev.toソースが見つからないため、作成します...');
      devtoSource = await prisma.source.create({
        data: {
          id: 'devto-test',
          name: 'Dev.to',
          url: 'https://dev.to',
          type: 'api',
          enabled: true,
        }
      });
    }

    console.error('ソース:', devtoSource.name);
    console.error('ソースID:', devtoSource.id);
    console.error();

    // フェッチャーを作成
    const fetcher = new DevToFetcher(devtoSource);
    
    // 記事を取得（最大3件に制限してテスト）
    console.error('Dev.to APIから記事を取得中...');
    const originalFetch = fetcher.fetch.bind(fetcher);
    fetcher.fetch = async () => {
      const result = await originalFetch();
      // テスト用に3件に制限
      result.articles = result.articles.slice(0, 3);
      return result;
    };

    const { articles, errors } = await fetcher.fetch();
    
    console.error(`取得した記事数: ${articles.length}`);
    if (errors.length > 0) {
      console.error('エラー:', errors);
    }
    console.error();

    // 各記事のタグを確認
    console.error('記事とタグの確認:');
    for (const article of articles) {
      console.error(`\n記事: ${article.title.substring(0, 60)}...`);
      console.error(`  URL: ${article.url}`);
      console.error(`  タグ: ${article.tagNames.join(', ')}`);
      console.error(`  タグ数: ${article.tagNames.length}`);
      
      // 1文字タグがないことを確認
      const singleCharTags = article.tagNames.filter(tag => 
        tag.length === 1 && !/^\d$/.test(tag)
      );
      if (singleCharTags.length > 0) {
        console.error(`  ⚠️ 警告: 1文字タグが検出されました: ${singleCharTags}`);
      } else {
        console.error(`  ✅ 1文字タグなし`);
      }
    }

    // データベースに保存（テスト用）
    console.error('\n=== データベース保存テスト ===\n');
    
    let savedCount = 0;
    let skippedCount = 0;
    
    for (const articleData of articles) {
      try {
        // 既存の記事をチェック
        const existing = await prisma.article.findUnique({
          where: { url: articleData.url }
        });

        if (existing) {
          console.error(`スキップ（既存）: ${articleData.title.substring(0, 40)}...`);
          skippedCount++;
          
          // 既存記事のタグを確認
          const existingWithTags = await prisma.article.findUnique({
            where: { url: articleData.url },
            include: { tags: true }
          });
          
          if (existingWithTags) {
            const badTags = existingWithTags.tags.filter(tag => 
              tag.name.length === 1 && !/^\d$/.test(tag.name)
            );
            if (badTags.length > 0) {
              console.error(`  ⚠️ 既存記事に不正なタグ: ${badTags.map(t => t.name).join(', ')}`);
            }
          }
        } else {
          // 新規作成
          const article = await prisma.article.create({
            data: {
              title: articleData.title,
              url: articleData.url,
              summary: articleData.summary,
              content: articleData.content,
              publishedAt: articleData.publishedAt,
              sourceId: devtoSource.id,
              tags: {
                connectOrCreate: articleData.tagNames.map(name => ({
                  where: { name },
                  create: { name },
                })),
              },
            },
            include: {
              tags: true,
            }
          });
          
          console.error(`✅ 保存: ${article.title.substring(0, 40)}...`);
          console.error(`  タグ: ${article.tags.map(t => t.name).join(', ')}`);
          savedCount++;
        }
      } catch (error) {
        console.error(`エラー: ${articleData.title}`, error);
      }
    }

    console.error(`\n結果: ${savedCount}件保存, ${skippedCount}件スキップ`);

  } catch (error) {
    console.error('テスト失敗:', error);
  } finally {
    await prisma.$disconnect();
  }

  console.error('\n=== テスト完了 ===');
}

testDevToFetchAndSave().catch(console.error);