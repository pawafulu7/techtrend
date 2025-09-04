#!/usr/bin/env tsx

/**
 * チャットのキーワード検出テスト
 * 「Rails」が「AI」として誤検出されないか確認
 */

import { extractSearchKeywords, getFixedResponse } from '../../lib/chat/utils';

console.error('🧪 チャットキーワード検出テスト\n');

const testCases = [
  'Rails',
  'rails',
  'Ruby on Rails',
  'Railsの記事を探して',
  'AI',
  'ai',
  'AIについて教えて',
  '人工知能',
  'Machine Learning',
  'Python',
  'Django',
  'React',
  'TypeScript',
  'JavaScript',
  'タイプスクリプト',
  'レイルズ',
  'ルビー'
];

console.error('📋 テストケース:\n');

testCases.forEach(testCase => {
  console.error(`\n入力: "${testCase}"`);
  
  // キーワード抽出
  const keywords = extractSearchKeywords(testCase);
  console.error(`  抽出されたキーワード: ${keywords.length > 0 ? keywords.join(', ') : 'なし'}`);
  
  // 固定応答
  const response = getFixedResponse(testCase);
  console.error(`  応答タイプ: ${response.type}`);
  
  if (keywords.length > 0) {
    console.error(`  ✅ 検索クエリとして認識`);
  }
});

console.error('\n\n🎯 特定のテスト:\n');

// Railsが正しく検出されるか
const railsTest = extractSearchKeywords('Rails');
const railsTest2 = extractSearchKeywords('rails');
const railsTestJp = extractSearchKeywords('レイルズ');

console.error('Rails検出テスト:');
console.error(`  "Rails" → ${railsTest.includes('rails') ? '✅ 成功' : '❌ 失敗'} (検出: ${railsTest.join(', ')})`);
console.error(`  "rails" → ${railsTest2.includes('rails') ? '✅ 成功' : '❌ 失敗'} (検出: ${railsTest2.join(', ')})`);
console.error(`  "レイルズ" → ${railsTestJp.includes('rails') ? '✅ 成功' : '❌ 失敗'} (検出: ${railsTestJp.join(', ')})`);

// AIが正しく検出されるか
const aiTest = extractSearchKeywords('AI');
const aiTest2 = extractSearchKeywords('ai');
const aiTestContext = extractSearchKeywords('AIについて教えて');

console.error('\nAI検出テスト:');
console.error(`  "AI" → ${aiTest.includes('ai') ? '✅ 成功' : '❌ 失敗'} (検出: ${aiTest.join(', ')})`);
console.error(`  "ai" → ${aiTest2.includes('ai') ? '✅ 成功' : '❌ 失敗'} (検出: ${aiTest2.join(', ')})`);
console.error(`  "AIについて教えて" → ${aiTestContext.includes('ai') ? '✅ 成功' : '❌ 失敗'} (検出: ${aiTestContext.join(', ')})`);

// Railsで誤ってAIが検出されないか
const railsNoAI = extractSearchKeywords('Rails');
console.error('\n誤検出テスト:');
console.error(`  "Rails"でAIが検出されない → ${!railsNoAI.includes('ai') ? '✅ 成功' : '❌ 失敗 (AIが誤検出されました)'}`);


