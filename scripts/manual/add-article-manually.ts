#!/usr/bin/env tsx
/**
 * 手動記事追加CLIツール
 * 
 * 使用方法:
 * npm run add-article -- --url="https://example.com/article"
 * npm run add-article -- --url="https://example.com/article" --title="カスタムタイトル"
 * npm run add-article -- --url="https://example.com/article" --skip-summary
 * npm run add-article -- --url="https://example.com/article" --dry-run
 */

import { Command } from 'commander';
import { addArticleManually, addArticlesBatch } from '../../lib/utils/article/article-manual-adder';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('add-article')
  .description('TechTrendに手動で記事を追加します')
  .version('1.0.0')
  .requiredOption('-u, --url <url>', '追加する記事のURL')
  .option('-t, --title <title>', 'カスタムタイトル（省略時は自動取得）')
  .option('--skip-summary', '要約生成をスキップ', false)
  .option('--skip-enrichment', 'エンリッチメント処理をスキップ', false)
  .option('--dry-run', 'ドライラン（実際には保存しない）', false)
  .option('-b, --batch <file>', 'バッチ処理用のURLリストファイル')
  .helpOption('-h, --help', 'ヘルプを表示')
  .parse(process.argv);

const options = program.opts();

/**
 * URLリストファイルを読み込む
 */
function loadUrlsFromFile(filePath: string): string[] {
  try {
    const absolutePath = path.resolve(filePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    
    // 各行をURLとして扱う（空行とコメント行を除く）
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    console.error(`❌ ファイル読み込みエラー: ${filePath}`, error);
    process.exit(1);
  }
}

/**
 * メイン処理
 */
async function main() {
  console.error('🚀 TechTrend 手動記事追加ツール\n');
  
  try {
    // バッチ処理モード
    if (options.batch) {
      console.error(`📋 バッチファイル読み込み: ${options.batch}`);
      const urls = loadUrlsFromFile(options.batch);
      
      if (urls.length === 0) {
        console.error('❌ URLリストが空です');
        process.exit(1);
      }
      
      console.error(`📊 ${urls.length}件のURLを処理します\n`);
      
      const results = await addArticlesBatch(urls, {
        title: options.title,
        skipSummary: options.skipSummary,
        skipEnrichment: options.skipEnrichment,
        dryRun: options.dryRun
      });
      
      // 結果サマリー
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      if (failed.length > 0) {
        console.error('\n❌ 失敗した記事:');
        failed.forEach((r, i) => {
          console.error(`  ${i + 1}. ${r.error}`);
        });
      }
      
      console.error(`\n✅ 完了: 成功 ${successful.length}件, 失敗 ${failed.length}件`);
      
    } else {
      // 単一記事処理モード
      console.error(`📍 URL: ${options.url}`);
      
      if (options.title) {
        console.error(`📝 タイトル: ${options.title}`);
      }
      
      if (options.dryRun) {
        console.error('🔄 ドライランモード（実際の保存なし）');
      }
      
      if (options.skipSummary) {
        console.error('⏭️ 要約生成をスキップ');
      }
      
      if (options.skipEnrichment) {
        console.error('⏭️ エンリッチメント処理をスキップ');
      }
      
      console.error(''); // 空行
      
      const result = await addArticleManually({
        url: options.url,
        title: options.title,
        skipSummary: options.skipSummary,
        skipEnrichment: options.skipEnrichment,
        dryRun: options.dryRun
      });
      
      console.error('\n' + '='.repeat(60));
      
      if (result.success) {
        console.error('✅ 記事追加成功！\n');
        console.error(`📄 タイトル: ${result.title}`);
        console.error(`🏷️ ソース: ${result.source}`);
        
        if (result.articleId) {
          console.error(`🆔 記事ID: ${result.articleId}`);
        }
        
        if (result.summary) {
          console.error(`\n📝 要約:\n${result.summary}`);
        }
        
        if (result.detailedSummary) {
          console.error(`\n📋 詳細要約:\n${result.detailedSummary}`);
        }
        
        if (result.message) {
          console.error(`\n💬 ${result.message}`);
        }
      } else {
        console.error('❌ 記事追加失敗\n');
        console.error(`エラー: ${result.error}`);
        
        if (result.articleId) {
          console.error(`\n既存記事ID: ${result.articleId}`);
          console.error(`既存記事タイトル: ${result.title}`);
        }
        
        process.exit(1);
      }
    }
    
    console.error('\n' + '='.repeat(60));
    console.error('👋 処理完了');
    
  } catch (error) {
    console.error('\n❌ 予期しないエラーが発生しました:', error);
    process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// メイン処理実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});