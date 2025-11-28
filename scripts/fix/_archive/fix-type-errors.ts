#!/usr/bin/env tsx
/**
 * 型エラーの自動修正スクリプト
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

async function fixTypeErrors() {
  console.log('🔧 型エラーの自動修正を開始...');

  // 1. SourceCategory型の追加
  const sourcesCategoryType = `// ソースカテゴリ型定義
export type SourceCategory = 'tech' | 'blog' | 'news' | 'community' | 'other';
`;

  try {
    const sourcesContentPath = 'app/sources/sources-content.tsx';
    const content = await fs.readFile(sourcesContentPath, 'utf-8');
    if (!content.includes('SourceCategory')) {
      const newContent = sourcesCategoryType + '\n' + content;
      await fs.writeFile(sourcesContentPath, newContent);
      console.log('✅ SourceCategory型を追加');
    }
  } catch (error) {
    console.error('❌ SourceCategory型の追加に失敗:', error);
  }

  // 2. never型エラーの修正（配列の型指定）
  const filesToFix = [
    'lib/ai/gemini.ts',
    'lib/cache/stats-cache.ts',
    'lib/cache/trends-cache.ts',
  ];

  for (const filePath of filesToFix) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let modified = content;

      // 配列の初期化で型指定がない箇所を修正
      modified = modified.replace(/const\s+(\w+)\s*=\s*\[\];/g, 'const $1: any[] = [];');
      
      // pushで never型エラーが出る場合の修正
      modified = modified.replace(/const\s+tags\s*=\s*\[\];/g, 'const tags: string[] = [];');
      modified = modified.replace(/const\s+errors\s*=\s*\[\];/g, 'const errors: string[] = [];');
      modified = modified.replace(/const\s+warnings\s*=\s*\[\];/g, 'const warnings: string[] = [];');

      if (modified !== content) {
        await fs.writeFile(filePath, modified);
        console.log(`✅ ${path.basename(filePath)}: never型エラーを修正`);
      }
    } catch (error) {
      console.error(`❌ ${filePath}の修正に失敗:`, error);
    }
  }

  // 3. summaryVersionの型不一致を修正
  try {
    const contentAwarePath = 'lib/ai/content-aware-summary-service.ts';
    let content = await fs.readFile(contentAwarePath, 'utf-8');
    
    // summaryVersion: 6 を 8 に変更
    content = content.replace(/summaryVersion:\s*6/g, 'summaryVersion: 8');
    
    await fs.writeFile(contentAwarePath, content);
    console.log('✅ summaryVersionの型を修正');
  } catch (error) {
    console.error('❌ summaryVersionの修正に失敗:', error);
  }

  console.log('\n🎉 型エラーの自動修正が完了しました');
}

// 実行
fixTypeErrors().catch(console.error);