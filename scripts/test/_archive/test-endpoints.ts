#!/usr/bin/env -S tsx
/**
 * エンドポイントテスト
 * summaryVersion 7対応とその他の変更を検証
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  statusCode?: number;
  message?: string;
  responseTime?: number;
}

const tests: TestResult[] = [];

async function testEndpoint(
  method: string,
  endpoint: string,
  expectedStatus: number = 200,
  data?: any
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
      validateStatus: () => true // Don't throw on any status
    });

    result.statusCode = response.status;
    result.responseTime = Date.now() - startTime;

    if (response.status === expectedStatus) {
      result.status = 'PASS';
      result.message = `OK (${result.responseTime}ms)`;
    } else {
      result.status = 'FAIL';
      result.message = `Expected ${expectedStatus}, got ${response.status}`;
    }

    // 追加の検証
    if (endpoint.includes('/articles') && response.status === 200) {
      // summaryVersion 7の記事が存在することを確認
      if (Array.isArray(response.data)) {
        const v7Articles = response.data.filter((a: any) => a.summaryVersion === 7);
        if (v7Articles.length > 0) {
          result.message += ` | Found ${v7Articles.length} v7 articles`;
        }
      } else if (response.data?.summaryVersion === 7) {
        result.message += ' | Article has v7 summary';
      }
    }

  } catch (error: any) {
    result.status = 'FAIL';
    result.message = error.message;
    result.responseTime = Date.now() - startTime;
  }

  return result;
}

async function runTests() {
  console.error('========================================');
  console.error('TechTrend API エンドポイントテスト');
  console.error('========================================\n');
  console.error(`開始時刻: ${new Date().toISOString()}`);
  console.error(`ベースURL: ${BASE_URL}\n`);

  // 1. 記事一覧取得
  console.error('▶ 記事一覧エンドポイントのテスト...');
  tests.push(await testEndpoint('GET', '/articles'));
  tests.push(await testEndpoint('GET', '/articles?limit=10'));
  tests.push(await testEndpoint('GET', '/articles?search=AI'));
  tests.push(await testEndpoint('GET', '/articles?tag=AI'));

  // 2. 特定記事取得（summaryVersion 7の記事）
  console.error('▶ 個別記事エンドポイントのテスト...');
  // まず最新の記事IDを取得
  try {
    const articlesResponse = await axios.get(`${BASE_URL}/articles?limit=1`);
    if (articlesResponse.data && articlesResponse.data.length > 0) {
      const articleId = articlesResponse.data[0].id;
      tests.push(await testEndpoint('GET', `/articles/${articleId}`));
    }
  } catch (error) {
    console.error('記事ID取得エラー:', error);
  }

  // 3. ソース一覧
  console.error('▶ ソース関連エンドポイントのテスト...');
  tests.push(await testEndpoint('GET', '/sources'));
  tests.push(await testEndpoint('GET', '/sources/stats'));

  // 4. タグ一覧
  console.error('▶ タグ関連エンドポイントのテスト...');
  tests.push(await testEndpoint('GET', '/tags'));
  tests.push(await testEndpoint('GET', '/tags/popular'));

  // 5. 統計情報
  console.error('▶ 統計エンドポイントのテスト...');
  tests.push(await testEndpoint('GET', '/stats'));
  tests.push(await testEndpoint('GET', '/stats/sources'));

  // 6. 検索（複数キーワード対応の確認）
  console.error('▶ 検索機能のテスト...');
  tests.push(await testEndpoint('GET', `/articles?search=${encodeURIComponent('TypeScript React')}`));
  tests.push(await testEndpoint('GET', `/articles?search=${encodeURIComponent('AI 機械学習')}`));

  // テスト結果の集計
  console.error('\n========================================');
  console.error('テスト結果サマリー');
  console.error('========================================\n');

  const passCount = tests.filter(t => t.status === 'PASS').length;
  const failCount = tests.filter(t => t.status === 'FAIL').length;
  
  console.error(`総テスト数: ${tests.length}`);
  console.error(`✅ 成功: ${passCount}`);
  console.error(`❌ 失敗: ${failCount}`);
  console.error(`成功率: ${((passCount / tests.length) * 100).toFixed(1)}%\n`);

  // 詳細結果
  console.error('詳細結果:');
  console.error('─'.repeat(80));
  tests.forEach(test => {
    const icon = test.status === 'PASS' ? '✅' : '❌';
    console.error(`${icon} ${test.method.padEnd(6)} ${test.endpoint.padEnd(40)} | ${test.message || ''}`);
  });

  // 失敗したテストの詳細
  const failedTests = tests.filter(t => t.status === 'FAIL');
  if (failedTests.length > 0) {
    console.error('\n❌ 失敗したテストの詳細:');
    console.error('─'.repeat(80));
    failedTests.forEach(test => {
      console.error(`エンドポイント: ${test.method} ${test.endpoint}`);
      console.error(`エラー: ${test.message}`);
      console.error('');
    });
  }

  // summaryVersion 7 の確認
  console.error('\n========================================');
  console.error('summaryVersion 7 移行状況の確認');
  console.error('========================================\n');
  
  try {
    const response = await axios.get(`${BASE_URL}/stats`);
    if (response.data) {
      console.error(`総記事数: ${response.data.totalArticles || 'N/A'}`);
      
      // Version 7の記事数を確認
      const v7Response = await axios.get(`${BASE_URL}/articles?limit=100`);
      const v7Count = v7Response.data.filter((a: any) => a.summaryVersion === 7).length;
      console.error(`summaryVersion 7の記事: ${v7Count}件（サンプル100件中）`);
    }
  } catch (error) {
    console.error('統計情報取得エラー');
  }

  return failCount === 0;
}

// メイン実行
(async () => {
  try {
    const success = await runTests();
    
    console.error('\n========================================');
    console.error('テスト完了');
    console.error('========================================\n');
    
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('テスト実行エラー:', error);
    process.exit(1);
  }
})();