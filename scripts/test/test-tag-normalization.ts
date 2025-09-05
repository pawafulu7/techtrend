#!/usr/bin/env npx tsx

import { normalizeTagInput } from '../lib/utils/tag-normalizer';

async function testTagNormalization() {
  console.error('=== Dev.to タグ正規化テスト ===\n');

  // テストケース1: 配列形式（リストAPI）
  console.error('1. 配列形式のタグ（リストAPI形式）');
  const arrayTags = ['webdev', 'javascript', 'programming', 'opensource'];
  console.error('  入力:', arrayTags);
  console.error('  出力:', normalizeTagInput(arrayTags));
  console.error();

  // テストケース2: 文字列形式（詳細API）
  console.error('2. 文字列形式のタグ（詳細API形式）');
  const stringTags = 'webdev, javascript, programming, opensource';
  console.error('  入力:', stringTags);
  console.error('  出力:', normalizeTagInput(stringTags));
  console.error();

  // テストケース3: 1文字タグの混入
  console.error('3. 1文字タグが混入した場合');
  const contaminatedTags = ['g', 'p', 't', ',', ' ', 'b', 'u', 's', 'i', 'n', 'e', 's', 's', 'react', 'javascript'];
  console.error('  入力:', contaminatedTags);
  console.error('  出力:', normalizeTagInput(contaminatedTags));
  console.error();

  // テストケース4: 実際のDev.to APIコール
  console.error('4. 実際のDev.to APIからの取得');
  try {
    // リストAPI
    const listResponse = await fetch('https://dev.to/api/articles?per_page=1&top=1');
    const listArticles = await listResponse.json();
    
    if (listArticles.length > 0) {
      const article = listArticles[0];
      console.error('  リストAPI:');
      console.error('    記事:', article.title.substring(0, 50) + '...');
      console.error('    tag_list:', article.tag_list);
      console.error('    正規化後:', normalizeTagInput(article.tag_list));
      
      // 詳細API
      const detailResponse = await fetch(`https://dev.to/api/articles/${article.id}`);
      const detailArticle = await detailResponse.json();
      console.error('  詳細API:');
      console.error('    tag_list:', detailArticle.tag_list);
      console.error('    型:', Array.isArray(detailArticle.tag_list) ? 'array' : typeof detailArticle.tag_list);
      console.error('    正規化後:', normalizeTagInput(detailArticle.tag_list));
    }
  } catch (error) {
    console.error('  APIエラー:', error);
  }
  console.error();

  // テストケース5: エッジケース
  console.error('5. エッジケース');
  console.error('  null:', normalizeTagInput(null));
  console.error('  undefined:', normalizeTagInput(undefined));
  console.error('  空文字列:', normalizeTagInput(''));
  console.error('  カンマのみ:', normalizeTagInput(',,,'));
  console.error('  数字の1文字:', normalizeTagInput(['5', 'a', 'react']));
  
  console.error('\n=== テスト完了 ===');
}

testTagNormalization().catch(console.error);