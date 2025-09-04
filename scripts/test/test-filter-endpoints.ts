#!/usr/bin/env -S tsx
/**
 * フィルター永続化機能のエンドポイントテスト
 * Docker環境での実行を前提とする
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  statusCode?: number;
  error?: string;
  responseTime?: number;
}

const results: TestResult[] = [];

async function testEndpoint(
  method: string,
  endpoint: string,
  data?: any,
  expectedStatus = 200
): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    endpoint,
    method,
    status: 'FAIL'
  };

  try {
    const response = await axios({
      method,
      url: `${BASE_URL}${endpoint}`,
      data,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000, // 10秒のタイムアウト
      validateStatus: () => true // すべてのステータスコードを受け入れる
    });

    result.statusCode = response.status;
    result.responseTime = Date.now() - startTime;
    
    if (response.status === expectedStatus) {
      result.status = 'PASS';
    } else {
      result.status = 'FAIL';
      result.error = `Expected ${expectedStatus}, got ${response.status}`;
    }
  } catch (error: any) {
    result.status = 'FAIL';
    if (error.code === 'ECONNABORTED') {
      result.error = `Request timeout after 10 seconds`;
    } else {
      result.error = error.message;
    }
  }

  return result;
}

async function runTests() {
  console.error('🧪 フィルター永続化機能のエンドポイントテスト開始\n');
  console.error('📍 環境: Docker (localhost:3000)');
  console.error('🎯 テスト対象: フィルター関連APIエンドポイント\n');
  console.error('=' .repeat(60));

  // 1. Filter Preferences API Tests
  console.error('\n📋 Filter Preferences API');
  console.error('-' .repeat(40));
  
  // GET test
  results.push(await testEndpoint('GET', '/api/filter-preferences'));
  console.error(`  GET  /api/filter-preferences: ${results[results.length - 1].status}`);
  
  // POST test
  const filterData = {
    sources: ['test-source-1', 'test-source-2'],
    search: 'test keyword',
    sortBy: 'qualityScore'
  };
  results.push(await testEndpoint('POST', '/api/filter-preferences', filterData));
  console.error(`  POST /api/filter-preferences: ${results[results.length - 1].status}`);
  
  // DELETE test
  results.push(await testEndpoint('DELETE', '/api/filter-preferences'));
  console.error(`  DELETE /api/filter-preferences: ${results[results.length - 1].status}`);

  // 2. Source Filter API Tests
  console.error('\n📋 Source Filter API');
  console.error('-' .repeat(40));
  
  // GET test
  results.push(await testEndpoint('GET', '/api/source-filter'));
  console.error(`  GET  /api/source-filter: ${results[results.length - 1].status}`);
  
  // POST test
  const sourceData = { sourceIds: ['source1', 'source2'] };
  results.push(await testEndpoint('POST', '/api/source-filter', sourceData));
  console.error(`  POST /api/source-filter: ${results[results.length - 1].status}`);
  
  // DELETE test
  results.push(await testEndpoint('DELETE', '/api/source-filter'));
  console.error(`  DELETE /api/source-filter: ${results[results.length - 1].status}`);

  // 3. Articles API with filter parameters
  console.error('\n📋 Articles API (with filters)');
  console.error('-' .repeat(40));
  
  // Test with various filter combinations
  const filterTests = [
    { params: '', desc: 'No filters' },
    { params: '?sources=none', desc: 'Empty source filter' },
    { params: '?search=TypeScript', desc: 'Search filter' },
    { params: '?sortBy=qualityScore', desc: 'Sort filter' },
    { params: '?sources=none&search=test', desc: 'Combined filters' }
  ];

  for (const test of filterTests) {
    const result = await testEndpoint('GET', `/api/articles${test.params}`);
    results.push(result);
    console.error(`  GET  /api/articles${test.params}: ${result.status} (${test.desc})`);
  }

  // 4. Generate summary report
  console.error('\n' + '=' .repeat(60));
  console.error('📊 テスト結果サマリー\n');
  
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  
  console.error(`  ✅ 成功: ${passed}/${total}`);
  console.error(`  ❌ 失敗: ${failed}/${total}`);
  console.error(`  📈 成功率: ${passRate}%`);
  
  // Show failures if any
  if (failed > 0) {
    console.error('\n⚠️ 失敗したテスト:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.error(`  - ${r.method} ${r.endpoint}: ${r.error || 'Unknown error'}`);
    });
  }

  // Performance metrics
  console.error('\n⏱️ パフォーマンス:');
  const avgResponseTime = results
    .filter(r => r.responseTime)
    .reduce((sum, r) => sum + (r.responseTime || 0), 0) / results.length;
  console.error(`  平均レスポンス時間: ${avgResponseTime.toFixed(0)}ms`);

  return {
    passed,
    failed,
    total,
    passRate: parseFloat(passRate),
    results
  };
}

// Execute tests
runTests()
  .then(summary => {
    console.error('\n✨ テスト完了\n');
    process.exit(summary.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('❌ テスト実行エラー:', error);
    process.exit(1);
  });