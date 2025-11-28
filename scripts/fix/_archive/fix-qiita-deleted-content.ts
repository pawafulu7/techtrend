#!/usr/bin/env npx tsx

/**
 * はてなブックマーク経由Qiita記事の誤った削除メッセージを修正
 * 
 * 使用方法:
 *   npx tsx scripts/fix-qiita-deleted-content.ts [オプション]
 * 
 * オプション:
 *   --dry-run    実際の更新を行わず、取得のみ実行
 */

import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

// 影響を受けた記事のID
const AFFECTED_ARTICLE_IDS = [
  'cmdq3y8kd001fte56wktmagc9',
  'cmds2554b005xteo6r1aipjb6',
  'cme5etrjt001wte2ah1sz9i22',
  'cme6l4k2g000ztew78qshktu3',
  'cme6l4kaf001btew78fy31tcl',
];

// コマンドライン引数の解析
interface Options {
  dryRun: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run')
  };
}

// HTMLからテキストを抽出
function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  
  // スクリプトとスタイルタグを削除
  $('script').remove();
  $('style').remove();
  
  // 改行を保持しながらテキストを抽出
  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

// Qiita記事のコンテンツを取得
async function fetchQiitaContent(url: string): Promise<{ 
  content: string | null; 
  title: string | null;
  error?: string;
}> {
  try {
    console.error(`  📡 コンテンツ取得中: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { content: null, title: null, error: 'Article not found (404)' };
      }
      return { content: null, title: null, error: `HTTP error: ${response.status}` };
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // 記事のタイトルを取得
    const title = $('h1.it-Header_title').text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  null;
    
    // 記事本文を取得（Qiitaの記事本文は .it-MdContent クラス内にある）
    let content = $('.it-MdContent').html() || '';
    
    // HTMLタグを除去してテキストのみを抽出
    if (content) {
      content = extractTextFromHtml(content);
    }
    
    // フォールバック: og:descriptionを使用
    if (!content || content.length < 100) {
      const ogDescription = $('meta[property="og:description"]').attr('content');
      if (ogDescription) {
        content = ogDescription;
      }
    }
    
    return { content, title };
  } catch (error) {
    console.error(`  ❌ 取得エラー:`, error);
    return { 
      content: null, 
      title: null,
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// メイン処理
async function main() {
  const options = parseArgs();
  
  console.error('🔧 はてなブックマーク経由Qiita記事の修正スクリプト');
  console.error('================================');
  console.error(`モード: ${options.dryRun ? 'ドライラン（更新なし）' : '本番実行'}`);
  console.error(`対象記事数: ${AFFECTED_ARTICLE_IDS.length}件`);
  console.error('================================\n');

  try {
    // 統計情報
    let successCount = 0;
    let errorCount = 0;
    let contentLengthBefore = 0;
    let contentLengthAfter = 0;

    // 各記事を処理
    for (let i = 0; i < AFFECTED_ARTICLE_IDS.length; i++) {
      const articleId = AFFECTED_ARTICLE_IDS[i];
      const progress = `[${i + 1}/${AFFECTED_ARTICLE_IDS.length}]`;
      
      console.error(`${progress} 処理中: ${articleId}`);
      
      // 現在の記事情報を取得
      const article = await prisma.article.findUnique({
        where: { id: articleId },
        select: {
          id: true,
          title: true,
          url: true,
          content: true,
          summary: true,
          detailedSummary: true,
        }
      });
      
      if (!article) {
        console.error(`  ⚠️ 記事が見つかりません`);
        errorCount++;
        continue;
      }
      
      console.error(`  📄 タイトル: ${article.title.substring(0, 50)}...`);
      console.error(`  📏 現在のコンテンツ長: ${article.content?.length || 0}文字`);
      
      // 削除メッセージかチェック
      const isDeletedMessage = article.content?.includes('Deleted articles cannot be recovered');
      console.error(`  🔍 削除メッセージ: ${isDeletedMessage ? '検出' : 'なし'}`);
      
      if (!isDeletedMessage) {
        console.error(`  ⏭️ スキップ: 削除メッセージなし`);
        continue;
      }
      
      // Qiita記事のコンテンツを取得
      const result = await fetchQiitaContent(article.url);
      
      if (result.error) {
        console.error(`  ❌ エラー: ${result.error}`);
        errorCount++;
        continue;
      }
      
      if (!result.content) {
        console.error(`  ⚠️ コンテンツが取得できません`);
        errorCount++;
        continue;
      }
      
      console.error(`  📏 新しいコンテンツ長: ${result.content.length}文字`);
      
      // 統計情報の更新
      contentLengthBefore += article.content?.length || 0;
      contentLengthAfter += result.content.length;
      
      // データベース更新（ドライランでない場合）
      if (!options.dryRun) {
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            content: result.content,
            // 要約をリセット（再生成が必要）
            summary: null,
            detailedSummary: null,
            articleType: null,
            summaryVersion: 0,
            qualityScore: 0
          }
        });
        console.error(`  ✅ 更新完了`);
      } else {
        console.error(`  🔍 ドライラン: 更新をスキップ`);
      }
      
      successCount++;
      
      // レート制限対策
      if (i < AFFECTED_ARTICLE_IDS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // 結果サマリー
    console.error('\n================================');
    console.error('📊 処理結果サマリー');
    console.error('================================');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    
    if (successCount > 0) {
      console.error(`📏 コンテンツ長（平均）:`);
      console.error(`   更新前: ${Math.round(contentLengthBefore / successCount)}文字`);
      console.error(`   更新後: ${Math.round(contentLengthAfter / successCount)}文字`);
      console.error(`   改善率: ${Math.round((contentLengthAfter / contentLengthBefore - 1) * 100)}%`);
    }
    
    if (!options.dryRun && successCount > 0) {
      console.error('\n💡 次のステップ:');
      console.error('1. 要約を再生成: npm run scripts:summarize');
      console.error('2. 品質を確認: npx tsx scripts/check-article-quality.ts');
    }

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