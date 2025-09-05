/**
 * GoogleAIEnricher URLパターンテスト
 * 新旧すべてのURLパターンの動作確認
 */

import { GoogleAIEnricher } from '../../lib/enrichers/google-ai';

const enricher = new GoogleAIEnricher();

// テスト用URLパターン
const testUrls = [
  // 旧パターン（従来から対応）
  { url: 'https://blog.google/technology/ai/gemini-update', expected: true, pattern: '/technology/ai/' },
  { url: 'https://blog.google/technology/google-deepmind/research', expected: true, pattern: '/technology/google-deepmind/' },
  { url: 'https://blog.google/technology/developers/api-update', expected: true, pattern: '/technology/developers/' },
  
  // 新パターン（今回追加）
  { url: 'https://blog.google/products/search/ai-mode', expected: true, pattern: '/products/' },
  { url: 'https://blog.google/products/pixel/pixel-10', expected: true, pattern: '/products/' },
  { url: 'https://blog.google/products/photos/edit-images', expected: true, pattern: '/products/' },
  { url: 'https://blog.google/intl/ja-jp/news', expected: true, pattern: '/intl/' },
  { url: 'https://blog.google/inside-google/company-announcements/stephen-curry', expected: true, pattern: '/inside-google/' },
  { url: 'https://blog.google/inside-google/infrastructure/data-centers', expected: true, pattern: '/inside-google/' },
  
  // 対象外URL（falseを期待）
  { url: 'https://blog.google/outreach-initiatives/education', expected: false, pattern: 'none' },
  { url: 'https://blog.google/around-the-globe/europe', expected: false, pattern: 'none' },
  { url: 'https://other-site.com/blog/ai', expected: false, pattern: 'none' },
];

console.error('=== GoogleAIEnricher URLパターンテスト ===\n');

let passed = 0;
let failed = 0;

testUrls.forEach((test, index) => {
  const result = enricher.canHandle(test.url);
  const status = result === test.expected ? '✅ PASS' : '❌ FAIL';
  
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
  }
  
  console.error(`[${index + 1}] ${status}`);
  console.error(`  URL: ${test.url}`);
  console.error(`  Pattern: ${test.pattern}`);
  console.error(`  Expected: ${test.expected}, Got: ${result}`);
  console.error('');
});

console.error('=== テスト結果サマリ ===');
console.error(`総テスト数: ${testUrls.length}`);
console.error(`成功: ${passed}`);
console.error(`失敗: ${failed}`);
console.error(`成功率: ${((passed / testUrls.length) * 100).toFixed(1)}%`);

// テスト失敗があれば終了コード1で終了
if (failed > 0) {
  process.exit(1);
}