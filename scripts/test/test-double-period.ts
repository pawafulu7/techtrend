import { checkContentQuality, fixSummary } from '@/lib/utils/content-quality-checker';

console.error('====================================');
console.error('二重句点修正テスト');
console.error('====================================\n');

// テストケース: 途切れた要約の修正
const testCases = [
  'Dockerコンテナの設定方法について、',
  'Kubernetesの環境構築において',
  'JavaScriptフレームワークの選定では',
  'APIの設計における',
  'データベースの最適化により',
  'セキュリティ対策として',
];

testCases.forEach((summary, index) => {
  console.error(`=== テストケース${index + 1} ===`);
  console.error(`入力: "${summary}"`);
  
  const result = checkContentQuality(summary);
  const fixed = fixSummary(summary, result.issues);
  
  console.error(`修正後: "${fixed}"`);
  console.error(`二重句点チェック: ${fixed.includes('。。') ? '❌ 二重句点あり' : '✅ 正常'}`);
  console.error('');

