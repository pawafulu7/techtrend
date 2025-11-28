#!/usr/bin/env tsx
/**
 * Partial型エラーの自動修正スクリプト
 * オブジェクトリテラルのPartial型エラーを修正
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function fixPartialErrors() {
  console.log('🔧 Partial型エラーの自動修正を開始...');

  // 対象ファイルを検索
  const patterns = [
    'lib/fetchers/*.ts',
    'scripts/**/*.ts',
    '!scripts/fix-*.ts', // 修正スクリプトは除外
  ];

  const files = await glob(patterns, { ignore: ['**/node_modules/**'] });
  console.log(`📁 対象ファイル数: ${files.length}`);

  let totalFixed = 0;

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf-8');
    let modified = content;
    let fileFixed = 0;

    // Pattern 1: Partial<Article>の中で_countを使用している箇所
    const pattern1 = /(\{[^}]*_count[^}]*\})\s*as\s+Partial<Article>/g;
    if (pattern1.test(modified)) {
      modified = modified.replace(pattern1, (match, objectLiteral) => {
        // _countフィールドを削除
        const cleaned = objectLiteral.replace(/_count:\s*\{[^}]*\},?\s*/g, '');
        fileFixed++;
        return `${cleaned} as Partial<Article>`;
      });
    }

    // Pattern 2: CreateArticleInputの型エラー
    const pattern2 = /const\s+article:\s*CreateArticleInput\s*=\s*\{([^}]+)\}/g;
    modified = modified.replace(pattern2, (match, content) => {
      // 不要なフィールドを削除
      let cleaned = content;
      cleaned = cleaned.replace(/articlesDisplayed:\s*[^,]+,?\s*/g, '');
      cleaned = cleaned.replace(/articlesCount:\s*[^,]+,?\s*/g, '');
      cleaned = cleaned.replace(/bookmarks:\s*[^,]+,?\s*/g, '');
      cleaned = cleaned.replace(/userVotes:\s*[^,]+,?\s*/g, '');
      
      if (cleaned !== content) {
        fileFixed++;
      }
      return `const article: CreateArticleInput = {${cleaned}}`;
    });

    // Pattern 3: Article型への直接代入で余分なプロパティを含む場合
    const pattern3 = /:\s*Article\s*=\s*\{([^}]*(?:articlesDisplayed|articlesCount)[^}]*)\}/g;
    modified = modified.replace(pattern3, (match, content) => {
      let cleaned = content;
      cleaned = cleaned.replace(/articlesDisplayed:\s*[^,]+,?\s*/g, '');
      cleaned = cleaned.replace(/articlesCount:\s*[^,]+,?\s*/g, '');
      
      if (cleaned !== content) {
        fileFixed++;
      }
      return `: Article = {${cleaned}}`;
    });

    // Pattern 4: オブジェクトスプレッド演算子での型エラー
    const pattern4 = /\.\.\.(article|item|data),\s*(bookmarks|userVotes):\s*[^,}]+/g;
    modified = modified.replace(pattern4, (match, spread, field) => {
      // bookmarksとuserVotesはArticle型に含まれているので削除しない
      return match;
    });

    // ファイルが変更された場合は保存
    if (modified !== content) {
      await fs.writeFile(filePath, modified);
      console.log(`✅ ${path.basename(filePath)}: ${fileFixed}箇所修正`);
      totalFixed += fileFixed;
    }
  }

  console.log(`\n🎉 合計 ${totalFixed} 箇所を修正しました`);
}

// 実行
fixPartialErrors().catch(console.error);