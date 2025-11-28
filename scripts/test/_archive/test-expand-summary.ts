import { expandSummaryIfNeeded } from '../../lib/utils/summary-quality-checker';

const testCases = [
  {
    input: '',
    title: 'ゲームの物理',
    expected: 'ゲームの物理に関する内容。'
  },
  {
    input: 'テスト',
    title: 'タイトル',
    expected: 'タイトルについて、テスト。'
  },
  {
    input: 'すでに十分な長さの要約がここに書かれています。この要約は150文字を超えているため、そのまま返されるはずです。このテストケースは、既に十分な長さがある場合の動作を確認するためのものです。',
    title: '',
    expected: 'すでに十分な長さの要約がここに書かれています。この要約は150文字を超えているため、そのまま返されるはずです。このテストケースは、既に十分な長さがある場合の動作を確認するためのものです。'
  }
];

console.error('Testing expandSummaryIfNeeded function...\n');

for (const testCase of testCases) {
  const result = expandSummaryIfNeeded(testCase.input, testCase.title, 150, '');
  const pass = result === testCase.expected;
  
  console.error(`Input: "${testCase.input}"`);
  console.error(`Title: "${testCase.title}"`);
  console.error(`Expected: "${testCase.expected}"`);
  console.error(`Result:   "${result}"`);
  console.error(`Status: ${pass ? '✅ PASS' : '❌ FAIL'}`);
  
  // 「、。」が含まれていないことを確認
  if (result.includes('、。')) {
    console.error('⚠️  WARNING: Result contains unwanted "、。" pattern!');
  }
  
  console.error('---');
}