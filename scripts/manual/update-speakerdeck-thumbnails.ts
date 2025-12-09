#!/usr/bin/env npx tsx
/**
 * Speaker Deck記事のサムネイル取得・更新スクリプト
 * 既存のSpeaker Deck記事のサムネイルURLを取得してデータベースを更新
 */

import { PrismaClient } from '@prisma/client';
import * as cheerio from 'cheerio';

const prisma = new PrismaClient();

// コマンドライン引数の処理
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limit = args.includes('--limit') ? 
  parseInt(args[args.indexOf('--limit') + 1]) : undefined;

interface UpdateResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * 遅延処理
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * リトライ機能付きフェッチ
 */
async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.text();
    } catch (error) {
      if (i === retries) {
        throw error;
      }
      await delay(1000 * (i + 1));
    }
  }
  throw new Error('Fetch failed after retries');
}

/**
 * Speaker DeckのURLからサムネイルURLを取得
 */
async function fetchThumbnailUrl(articleUrl: string): Promise<string | null> {
  try {
    const html = await fetchWithRetry(articleUrl);
    const $ = cheerio.load(html);
    
    // JSON-LDから取得を試みる
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const data = JSON.parse(jsonLdScript);
        if (data.thumbnailUrl) {
          return data.thumbnailUrl;
        }
      } catch (error) {
        console.error('  JSON-LD解析エラー:', error);
      }
    }
    
    // OGイメージから取得
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
      return ogImage;
    }
    
    // プレゼンテーションIDから生成を試みる
    const urlMatch = articleUrl.match(/speakerdeck\.com\/[^\/]+\/([^\/\?]+)/);
    if (urlMatch) {
      // これは推測なので、実際のパターンと異なる場合がある
      console.error('  サムネイルURLが見つからないため、スキップします');
      return null;
    }
    
    return null;
  } catch (error) {
    console.error(`  サムネイル取得エラー: ${error}`);
    return null;
  }
}

/**
 * メイン処理
 */
async function updateSpeakerDeckThumbnails(): Promise<UpdateResult> {
  console.error('🖼️ Speaker Deck記事のサムネイル更新を開始します');
  console.error(`   モード: ${isDryRun ? 'ドライラン' : '実行'}`);
  if (limit) console.error(`   処理数制限: ${limit}件`);
  
  const result: UpdateResult = {
    success: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Speaker Deck記事を取得（URLベースでフィルタ、はてなブックマーク経由も対象）
    const articles = await prisma.article.findMany({
      where: {
        url: {
          contains: 'speakerdeck.com'
        },
        OR: [
          { thumbnail: null },
          { thumbnail: '' }
        ]
      },
      include: {
        source: true
      },
      take: limit,
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.error(`\n📊 処理対象: ${articles.length}件の記事\n`);

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const progress = `[${i + 1}/${articles.length}]`;
      
      console.error(`${progress} 処理中: ${article.title.substring(0, 50)}...`);
      console.error(`   URL: ${article.url}`);
      
      if (isDryRun) {
        console.error('   ⏭️ ドライラン: スキップ\n');
        result.skipped++;
        continue;
      }

      try {
        // サムネイルURL取得
        const thumbnailUrl = await fetchThumbnailUrl(article.url);
        
        if (!thumbnailUrl) {
          console.error('   ⚠️ サムネイルが見つかりません\n');
          result.failed++;
          result.errors.push(`${article.title}: サムネイル取得失敗`);
          continue;
        }

        // データベース更新
        await prisma.article.update({
          where: { id: article.id },
          data: {
            thumbnail: thumbnailUrl,
            updatedAt: new Date()
          }
        });

        console.error(`   ✅ 更新完了: ${thumbnailUrl.substring(0, 50)}...\n`);
        result.success++;

        // Rate Limit対策
        await delay(1000);
        
        // 10件ごとに長めの待機
        if ((i + 1) % 10 === 0 && i < articles.length - 1) {
          console.error('⏸️ Rate Limit対策: 5秒待機...\n');
          await delay(5000);
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`   ❌ エラー: ${errorMessage}\n`);
        result.failed++;
        result.errors.push(`${article.title}: ${errorMessage}`);
        
        // エラー時は長めに待機
        await delay(2000);
      }
    }

    // サムネイルが既に設定されている記事の確認（URLベース）
    const articlesWithThumbnail = await prisma.article.count({
      where: {
        url: {
          contains: 'speakerdeck.com'
        },
        thumbnail: {
          not: null
        }
      }
    });

    // 結果サマリー
    console.error('\n' + '='.repeat(60));
    console.error('📊 サムネイル更新完了');
    console.error('='.repeat(60));
    console.error(`✅ 成功: ${result.success}件`);
    console.error(`❌ 失敗: ${result.failed}件`);
    console.error(`⏭️ スキップ: ${result.skipped}件`);
    console.error(`📷 サムネイル設定済み: ${articlesWithThumbnail}件（全体）`);
    
    if (result.errors.length > 0 && result.errors.length <= 5) {
      console.error('\n❌ エラー詳細:');
      result.errors.forEach(err => console.error(`   - ${err}`));
    } else if (result.errors.length > 5) {
      console.error(`\n❌ エラー: ${result.errors.length}件（詳細は省略）`);
    }

    return result;

  } catch (error) {
    console.error('Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  updateSpeakerDeckThumbnails()
    .then(result => {
      process.exit(result.failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

export { updateSpeakerDeckThumbnails };