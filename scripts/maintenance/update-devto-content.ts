#!/usr/bin/env npx tsx

/**
 * Dev.to記事の本文を取得して更新するスクリプト
 * 
 * 使用方法:
 *   npx tsx scripts/update-devto-content.ts [オプション]
 * 
 * オプション:
 *   --dry-run    実際の更新を行わず、取得のみ実行
 *   --limit N    処理する記事数を制限（デフォルト: 全件）
 *   --id ID      特定の記事IDのみ処理
 */

import { createPrismaClient } from '@/lib/prisma/create-client';
import fetch from 'node-fetch';
import { stripHtmlTags } from '../../lib/utils/html-sanitizer';

const prisma = createPrismaClient();

// Rate Limit設定
const RATE_LIMIT = {
  requestsPerWindow: 30,
  windowMs: 30000,
  delayMs: 1500 // 1.5秒間隔
};

// コマンドライン引数の解析
interface Options {
  dryRun: boolean;
  limit?: number;
  specificId?: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') {
      options.dryRun = true;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--id' && args[i + 1]) {
      options.specificId = args[i + 1];
      i++;
    }
  }

  return options;
}

// 遅延処理
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 記事IDをURLから抽出
function extractArticleId(url: string): string | null {
  // URLパターン: https://dev.to/username/title-id
  const match = url.match(/dev\.to\/[^\/]+\/[^\/]+-([a-z0-9]+)$/);
  return match ? match[1] : null;
}

// Dev.to APIから記事本文を取得
async function fetchArticleContent(articleId: string): Promise<{
  content: string | null;
  bodyHtml?: string;
  bodyMarkdown?: string;
  error?: string;
}> {
  try {
    // Timeout using AbortController (15 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`https://dev.to/api/articles/${articleId}`, {
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { content: null, error: 'Article not found' };
      }
      if (response.status === 429) {
        return { content: null, error: 'Rate limit exceeded' };
      }
      return { content: null, error: `API error: ${response.status}` };
    }
    
    const data = await response.json() as any;
    
    // body_htmlを優先、なければbody_markdownを使用
    const content = data.body_html || data.body_markdown || null;
    
    return {
      content,
      bodyHtml: data.body_html,
      bodyMarkdown: data.body_markdown
    };
  } catch (error) {
    console.error(`Failed to fetch article ${articleId}:`, error);
    return { 
      content: null, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

// HTMLコンテンツのクリーンアップ
function cleanHtmlContent(html: string): string {
  // Use the library to strip dangerous tags while preserving content
  // Note: We keep some formatting here for readability of stored content
  const cleaned = stripHtmlTags(html);

  // 過度な改行の正規化
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

// メイン処理
async function main() {
  const options = parseArgs();
  
  console.error('🚀 Dev.to記事コンテンツ更新スクリプト');
  console.error('================================');
  console.error(`モード: ${options.dryRun ? 'ドライラン（更新なし）' : '本番実行'}`);
  if (options.limit) {
    console.error(`処理記事数: ${options.limit}件`);
  }
  if (options.specificId) {
    console.error(`特定記事ID: ${options.specificId}`);
  }
  console.error('================================\n');

  try {
    // Dev.toソースのIDを取得
    const devtoSource = await prisma.source.findFirst({
      where: { name: 'Dev.to' }
    });

    if (!devtoSource) {
      console.error('❌ Dev.toソースが見つかりません');
      return;
    }

    // 対象記事を取得
    const whereClause: any = {
      sourceId: devtoSource.id
    };

    if (options.specificId) {
      whereClause.id = options.specificId;
    }

    const articles = await prisma.article.findMany({
      where: whereClause,
      orderBy: { publishedAt: 'desc' },
      take: options.limit
    });

    console.error(`📊 対象記事数: ${articles.length}件\n`);

    // 統計情報
    let successCount = 0;
    let errorCount = 0;
    let skipCount = 0;
    let contentLengthBefore = 0;
    let contentLengthAfter = 0;

    // 各記事を処理
    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;
      
      console.error(`${progress} 処理中: ${article.title.substring(0, 50)}...`);
      
      // URLから記事IDを抽出
      const articleId = extractArticleId(article.url);
      
      if (!articleId) {
        console.error(`  ⚠️ スキップ: 記事IDを抽出できません`);
        skipCount++;
        continue;
      }
      
      console.error(`  📄 記事ID: ${articleId}`);
      console.error(`  📏 現在のコンテンツ長: ${article.content?.length || 0}文字`);
      
      // API呼び出し
      const result = await fetchArticleContent(articleId);
      
      if (result.error) {
        console.error(`  ❌ エラー: ${result.error}`);
        errorCount++;
        
        // Rate limitエラーの場合は長めに待機
        if (result.error.includes('Rate limit')) {
          console.error(`  ⏰ Rate limit待機中（30秒）...`);
          await delay(30000);
        }
        continue;
      }
      
      if (!result.content) {
        console.error(`  ⚠️ スキップ: コンテンツが取得できません`);
        skipCount++;
        continue;
      }
      
      // コンテンツのクリーンアップ
      const cleanedContent = cleanHtmlContent(result.content);
      console.error(`  📏 新しいコンテンツ長: ${cleanedContent.length}文字`);
      
      // 統計情報の更新
      contentLengthBefore += article.content?.length || 0;
      contentLengthAfter += cleanedContent.length;
      
      // データベース更新（ドライランでない場合）
      if (!options.dryRun) {
        await prisma.article.update({
          where: { id: article.id },
          data: { 
            content: cleanedContent,
            // 要約をnullにリセット（再生成が必要）
            summary: null,
            detailedSummary: null,
            articleType: null,
            summaryVersion: 0  // 0にリセット（再生成が必要）
          }
        });
        console.error(`  ✅ 更新完了`);
      } else {
        console.error(`  🔍 ドライラン: 更新をスキップ`);
      }
      
      successCount++;
      
      // Rate Limit対策の遅延
      if (i < articles.length - 1) {
        await delay(RATE_LIMIT.delayMs);
      }
    }

    // 結果サマリー
    console.error('\n================================');
    console.error('📊 処理結果サマリー');
    console.error('================================');
    console.error(`✅ 成功: ${successCount}件`);
    console.error(`❌ エラー: ${errorCount}件`);
    console.error(`⚠️ スキップ: ${skipCount}件`);
    console.error(`📏 コンテンツ長（平均）:`);
    console.error(`   更新前: ${Math.round(contentLengthBefore / articles.length)}文字`);
    console.error(`   更新後: ${Math.round(contentLengthAfter / successCount)}文字`);
    console.error(`   改善率: ${Math.round((contentLengthAfter / contentLengthBefore - 1) * 100)}%`);
    
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