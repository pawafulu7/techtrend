/**
 * イベント記事フィルタリング機能のテストスクリプト
 */

import { CorporateTechBlogFetcher } from '../lib/fetchers/corporate-tech-blog';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testEventFilter() {
  try {
    // Corporate Tech Blogソースを取得
    const source = await prisma.source.findFirst({
      where: { name: 'Corporate Tech Blog' }
    });

    if (!source) {
      console.error('Corporate Tech Blog source not found');
      return;
    }

    console.error('Testing event article filter...');
    console.error('EXCLUDE_EVENT_ARTICLES:', process.env.EXCLUDE_EVENT_ARTICLES || 'undefined (default: false)');
    console.error('---');

    // フェッチャーを初期化
    const fetcher = new CorporateTechBlogFetcher(source);

    // 記事を取得
    const result = await fetcher.fetch();

    console.error(`Total articles fetched: ${result.articles.length}`);
    
    // 記事のタイトルを表示（最初の10件）
    console.error('\nFirst 10 articles:');
    result.articles.slice(0, 10).forEach((article, index) => {
      console.error(`${index + 1}. ${article.title}`);
    });

    // エラーがあれば表示
    if (result.errors.length > 0) {
      console.error('\nErrors:');
      result.errors.forEach(error => {
        console.error(`- ${error.message}`);
      });
    }

    // イベント系キーワードを含む記事をカウント
    const eventKeywords = ['登壇', 'イベント', 'セミナー', '勉強会', 'カンファレンス', 'meetup', '参加募集', '開催'];
    const eventArticles = result.articles.filter(article => 
      eventKeywords.some(keyword => article.title.includes(keyword))
    );

    console.error(`\nArticles with event keywords: ${eventArticles.length}`);
    if (eventArticles.length > 0) {
      console.error('Event articles found:');
      eventArticles.forEach(article => {
        console.error(`- ${article.title}`);
      });
    }

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
testEventFilter();