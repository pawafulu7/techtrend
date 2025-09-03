#!/usr/bin/env node
/**
 * Hacker News記事の空のコンテンツを修正するスクリプト
 * 問題: エンリッチャーが対応していないドメインの記事でcontentがnullになる
 * 解決: URLから直接コンテンツを取得して更新
 */

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';
import { getUnifiedSummaryService } from '@/lib/ai/unified-summary-service';

const prisma = new PrismaClient();

// HTMLからテキストコンテンツを抽出
function extractTextContent(html: string): string {
  const $ = cheerio.load(html);
  
  // スクリプトとスタイルタグを削除
  $('script, style, noscript').remove();
  
  // ナビゲーションやサイドバーを削除
  $('.leftbar, .navigation, .toc, .sidebar, nav, aside').remove();
  
  // メインコンテンツを探す
  const contentSelectors = [
    'article',
    'main',
    '.content',
    '.post',
    '.entry',
    '#content',
    'body'
  ];
  
  let content = '';
  for (const selector of contentSelectors) {
    const element = $(selector).first();
    if (element.length && element.text().trim().length > 100) {
      content = element.text().trim();
      break;
    }
  }
  
  // フォールバック: body全体のテキスト
  if (!content) {
    content = $('body').text().trim();
  }
  
  // クリーンアップ
  content = content
    .replace(/\s+/g, ' ')  // 連続する空白を1つに
    .replace(/\n{3,}/g, '\n\n')  // 3つ以上の改行を2つに
    .trim();
  
  // 長すぎる場合は切り詰める
  if (content.length > 50000) {
    content = content.substring(0, 50000) + '...';
  }
  
  return content;
}

// URLからコンテンツを取得
async function fetchContent(url: string): Promise<string | null> {
  try {
    console.log(`  Fetching content from: ${url}`);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TechTrendBot/1.0)'
      },
      signal: AbortSignal.timeout(30000) // 30秒タイムアウト
    });
    
    if (!response.ok) {
      console.error(`  Failed to fetch: ${response.status}`);
      return null;
    }
    
    const html = await response.text();
    const content = extractTextContent(html);
    
    if (content.length < 100) {
      console.error(`  Content too short: ${content.length} chars`);
      return null;
    }
    
    console.log(`  Successfully extracted: ${content.length} chars`);
    return content;
  } catch (error) {
    console.error(`  Error fetching: ${error}`);
    return null;
  }
}

async function main() {
  console.log('Hacker News記事の空コンテンツ修正を開始します...\n');
  
  // contentがnullのHacker News記事を取得
  const articles = await prisma.article.findMany({
    where: {
      source: { name: 'Hacker News' },
      content: null
    },
    include: { source: true },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`対象記事数: ${articles.length}件\n`);
  
  if (articles.length === 0) {
    console.log('修正対象の記事がありません。');
    return;
  }
  
  let fixed = 0;
  let failed = 0;
  let regenerated = 0;
  
  for (const article of articles) {
    console.log(`\n処理中: ${article.title}`);
    console.log(`  ID: ${article.id}`);
    console.log(`  URL: ${article.url}`);
    
    // コンテンツを取得
    const content = await fetchContent(article.url);
    
    if (content) {
      // データベースを更新
      await prisma.article.update({
        where: { id: article.id },
        data: { content }
      });
      
      console.log(`  ✓ コンテンツを更新しました`);
      fixed++;
      
      // 要約が「内容が空白」の場合は再生成
      if (article.summary?.includes('内容が空白')) {
        console.log(`  要約を再生成中...`);
        
        try {
          const summaryService = getUnifiedSummaryService();
          const result = await summaryService.generate(article.title, content);
          
          await prisma.article.update({
            where: { id: article.id },
            data: {
              summary: result.summary,
              detailedSummary: result.detailedSummary,
              summaryVersion: summaryService.getSummaryVersion(),
              articleType: 'unified'
            }
          });
          
          console.log(`  ✓ 要約を再生成しました`);
          regenerated++;
        } catch (error) {
          console.error(`  ✗ 要約の再生成に失敗: ${error}`);
        }
      }
    } else {
      console.log(`  ✗ コンテンツの取得に失敗しました`);
      failed++;
    }
    
    // Rate limit対策
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n========================================');
  console.log('処理完了:');
  console.log(`  修正成功: ${fixed}件`);
  console.log(`  修正失敗: ${failed}件`);
  console.log(`  要約再生成: ${regenerated}件`);
}

main()
  .then(() => {
    console.log('\n完了しました。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nエラーが発生しました:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });