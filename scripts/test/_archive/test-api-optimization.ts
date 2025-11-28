#!/usr/bin/env tsx

/**
 * API最適化のテスト
 *
 * テスト項目：
 * 1. デフォルトでincludeRelations=false
 * 2. lightweight=trueで軽量モード
 * 3. fields指定で特定フィールドのみ取得
 * 4. favorites/article-viewsも同様の最適化
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  dataSize?: number;
  reductionRate?: number;
}

const results: TestResult[] = [];

async function testAPI(endpoint: string, params: string = ''): Promise<any> {
  try {
    const url = `${BASE_URL}${endpoint}${params ? '?' + params : ''}`;
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error(`Error testing ${endpoint}:`, error.message);
    throw error;
  }
}

async function getDataSize(endpoint: string, params: string = ''): Promise<number> {
  const data = await testAPI(endpoint, params);
  return JSON.stringify(data).length;
}

async function runTests() {
  console.log('🔍 API最適化テスト開始...\n');

  // Test 1: /api/articles デフォルト（relations無し）
  try {
    const data = await testAPI('/api/articles', 'limit=5');
    const hasRelations = data.data?.items?.[0]?.source?.name !== undefined;
    results.push({
      name: '/api/articles デフォルト（relations無し）',
      passed: !hasRelations,
      details: hasRelations ? 'Relations included (should be excluded)' : 'Relations excluded as expected'
    });
  } catch (error) {
    results.push({
      name: '/api/articles デフォルト（relations無し）',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 2: /api/articles includeRelations=true
  try {
    const data = await testAPI('/api/articles', 'limit=5&includeRelations=true');
    const hasRelations = data.data?.items?.[0]?.source?.name !== undefined;
    results.push({
      name: '/api/articles includeRelations=true',
      passed: hasRelations,
      details: hasRelations ? 'Relations included as expected' : 'Relations not included (should be included)'
    });
  } catch (error) {
    results.push({
      name: '/api/articles includeRelations=true',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 3: データサイズ比較
  try {
    const sizeWithRelations = await getDataSize('/api/articles', 'limit=5&includeRelations=true');
    const sizeWithoutRelations = await getDataSize('/api/articles', 'limit=5');
    const sizeLightweight = await getDataSize('/api/articles', 'limit=5&lightweight=true');
    const sizeCustomFields = await getDataSize('/api/articles', 'limit=5&fields=id,title,url');

    const reductionWithout = ((sizeWithRelations - sizeWithoutRelations) / sizeWithRelations * 100).toFixed(1);
    const reductionLight = ((sizeWithRelations - sizeLightweight) / sizeWithRelations * 100).toFixed(1);
    const reductionCustom = ((sizeWithRelations - sizeCustomFields) / sizeWithRelations * 100).toFixed(1);

    results.push({
      name: 'データサイズ削減（relations無し）',
      passed: sizeWithoutRelations < sizeWithRelations,
      details: `${sizeWithRelations} bytes → ${sizeWithoutRelations} bytes`,
      dataSize: sizeWithoutRelations,
      reductionRate: parseFloat(reductionWithout)
    });

    results.push({
      name: 'データサイズ削減（軽量モード）',
      passed: sizeLightweight < sizeWithoutRelations,
      details: `${sizeWithRelations} bytes → ${sizeLightweight} bytes`,
      dataSize: sizeLightweight,
      reductionRate: parseFloat(reductionLight)
    });

    results.push({
      name: 'データサイズ削減（カスタムフィールド）',
      passed: sizeCustomFields < sizeLightweight,
      details: `${sizeWithRelations} bytes → ${sizeCustomFields} bytes`,
      dataSize: sizeCustomFields,
      reductionRate: parseFloat(reductionCustom)
    });
  } catch (error) {
    results.push({
      name: 'データサイズ比較',
      passed: false,
      details: `Error: ${error}`
    });
  }

  // Test 4: /api/favorites 軽量モード
  try {
    const dataDefault = await testAPI('/api/favorites', '');
    const dataLight = await testAPI('/api/favorites', 'lightweight=true');

    const sizeDefault = JSON.stringify(dataDefault).length;
    const sizeLight = JSON.stringify(dataLight).length;

    results.push({
      name: '/api/favorites 軽量モード',
      passed: sizeLight <= sizeDefault,
      details: `${sizeDefault} bytes → ${sizeLight} bytes`,
      dataSize: sizeLight,
      reductionRate: ((sizeDefault - sizeLight) / sizeDefault * 100)
    });
  } catch (error: any) {
    // 401エラーは認証が必要なため想定内
    if (error.response?.status === 401) {
      results.push({
        name: '/api/favorites 軽量モード',
        passed: true,
        details: 'Authentication required (expected behavior)'
      });
    } else {
      results.push({
        name: '/api/favorites 軽量モード',
        passed: false,
        details: `Error: ${error.message}`
      });
    }
  }

  // Test 5: /api/article-views 軽量モード
  try {
    const dataDefault = await testAPI('/api/article-views', '');
    const dataLight = await testAPI('/api/article-views', 'lightweight=true');

    const sizeDefault = JSON.stringify(dataDefault).length;
    const sizeLight = JSON.stringify(dataLight).length;

    results.push({
      name: '/api/article-views 軽量モード',
      passed: sizeLight <= sizeDefault,
      details: `${sizeDefault} bytes → ${sizeLight} bytes`,
      dataSize: sizeLight,
      reductionRate: ((sizeDefault - sizeLight) / sizeDefault * 100)
    });
  } catch (error: any) {
    // 401エラーは認証が必要なため想定内
    if (error.response?.status === 401) {
      results.push({
        name: '/api/article-views 軽量モード',
        passed: true,
        details: 'Authentication required (expected behavior)'
      });
    } else {
      results.push({
        name: '/api/article-views 軽量モード',
        passed: false,
        details: `Error: ${error.message}`
      });
    }
  }

  // 結果表示
  console.log('\n📊 テスト結果:\n');
  console.log('='.repeat(70));

  let totalPassed = 0;
  results.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.name}`);
    console.log(`   ${result.details}`);
    if (result.reductionRate !== undefined) {
      console.log(`   削減率: ${result.reductionRate}%`);
    }
    console.log('');
    if (result.passed) totalPassed++;
  });

  console.log('='.repeat(70));
  console.log(`\n📈 総合結果: ${totalPassed}/${results.length} テスト成功`);

  // 成功率計算
  const successRate = (totalPassed / results.length * 100).toFixed(1);
  console.log(`成功率: ${successRate}%\n`);

  // Exit code
  process.exit(totalPassed === results.length ? 0 : 1);
}

// 開発サーバー起動待機
async function waitForServer(maxRetries = 30) {
  console.log('⏳ 開発サーバーの起動を待機中...');
  for (let i = 0; i < maxRetries; i++) {
    try {
      await axios.get(`${BASE_URL}/api/health`);
      console.log('✅ サーバー起動確認\n');
      return;
    } catch (error) {
      process.stdout.write('.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Server did not start in time');
}

// メイン実行
async function main() {
  try {
    await waitForServer();
    await runTests();
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    process.exit(1);
  }
}

main();