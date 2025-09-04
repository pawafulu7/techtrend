#!/usr/bin/env npx tsx
/**
 * APIレスポンス修正後の確認テスト
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL';
  message?: string;
}

const tests: TestResult[] = [];

async function testSummaryVersionInList() {
  const testName = 'APIレスポンスにsummaryVersionが含まれる（一覧）';
  try {
    const response = await axios.get(`${BASE_URL}/articles?limit=5`);
    
    if (response.data.success && response.data.data?.items) {
      const items = response.data.data.items;
      
      // すべての記事にsummaryVersionが含まれているか確認
      const allHaveVersion = items.every((item: any) => 
        'summaryVersion' in item && item.summaryVersion !== null
      );
      
      // Version 7の記事が存在するか確認
      const v7Articles = items.filter((item: any) => item.summaryVersion === 7);
      
      if (allHaveVersion) {
        tests.push({
          name: testName,
          status: 'PASS',
          message: `全${items.length}件にsummaryVersion存在。Version 7: ${v7Articles.length}件`
        });
      } else {
        tests.push({
          name: testName,
          status: 'FAIL',
          message: 'summaryVersionが欠落している記事がある'
        });
      }
    } else {
      tests.push({
        name: testName,
        status: 'FAIL',
        message: 'APIレスポンス形式が不正'
      });
    }
  } catch (error: any) {
    tests.push({
      name: testName,
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testArticleTypeInList() {
  const testName = 'APIレスポンスにarticleTypeが含まれる（一覧）';
  try {
    const response = await axios.get(`${BASE_URL}/articles?limit=5`);
    
    if (response.data.success && response.data.data?.items) {
      const items = response.data.data.items;
      
      // すべての記事にarticleTypeが含まれているか確認
      const allHaveType = items.every((item: any) => 
        'articleType' in item && item.articleType !== null
      );
      
      // unified typeの記事数を確認
      const unifiedArticles = items.filter((item: any) => item.articleType === 'unified');
      
      if (allHaveType) {
        tests.push({
          name: testName,
          status: 'PASS',
          message: `全${items.length}件にarticleType存在。unified: ${unifiedArticles.length}件`
        });
      } else {
        tests.push({
          name: testName,
          status: 'FAIL',
          message: 'articleTypeが欠落している記事がある'
        });
      }
    } else {
      tests.push({
        name: testName,
        status: 'FAIL',
        message: 'APIレスポンス形式が不正'
      });
    }
  } catch (error: any) {
    tests.push({
      name: testName,
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testSummaryVersionInDetail() {
  const testName = 'APIレスポンスにsummaryVersionが含まれる（個別）';
  try {
    // まず記事IDを取得
    const listResponse = await axios.get(`${BASE_URL}/articles?limit=1`);
    
    if (listResponse.data.success && listResponse.data.data?.items?.length > 0) {
      const articleId = listResponse.data.data.items[0].id;
      
      // 個別記事を取得
      const detailResponse = await axios.get(`${BASE_URL}/articles/${articleId}`);
      
      if (detailResponse.data.success && detailResponse.data.data) {
        const article = detailResponse.data.data;
        
        if ('summaryVersion' in article && article.summaryVersion !== null) {
          tests.push({
            name: testName,
            status: 'PASS',
            message: `summaryVersion: ${article.summaryVersion}`
          });
        } else {
          tests.push({
            name: testName,
            status: 'FAIL',
            message: 'summaryVersionが欠落'
          });
        }
      } else {
        tests.push({
          name: testName,
          status: 'FAIL',
          message: 'APIレスポンス形式が不正'
        });
      }
    } else {
      tests.push({
        name: testName,
        status: 'FAIL',
        message: '記事が取得できない'
      });
    }
  } catch (error: any) {
    tests.push({
      name: testName,
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testVersion7Distribution() {
  const testName = 'Version 7移行状況の確認';
  try {
    const response = await axios.get(`${BASE_URL}/articles?limit=100`);
    
    if (response.data.success && response.data.data?.items) {
      const items = response.data.data.items;
      
      const versionDistribution: Record<number, number> = {};
      items.forEach((item: any) => {
        const version = item.summaryVersion || 0;
        versionDistribution[version] = (versionDistribution[version] || 0) + 1;
      });
      
      const v7Count = versionDistribution[7] || 0;
      const v7Percentage = (v7Count / items.length * 100).toFixed(1);
      
      tests.push({
        name: testName,
        status: 'PASS',
        message: `Version 7: ${v7Count}/${items.length}件 (${v7Percentage}%), 分布: ${JSON.stringify(versionDistribution)}`
      });
    } else {
      tests.push({
        name: testName,
        status: 'FAIL',
        message: 'データ取得失敗'
      });
    }
  } catch (error: any) {
    tests.push({
      name: testName,
      status: 'FAIL',
      message: error.message
    });
  }
}

async function testSearchWithVersion() {
  const testName = '検索結果にもsummaryVersionが含まれる';
  try {
    const response = await axios.get(`${BASE_URL}/articles?search=AI&limit=5`);
    
    if (response.data.success && response.data.data?.items) {
      const items = response.data.data.items;
      
      const allHaveVersion = items.every((item: any) => 
        'summaryVersion' in item && item.summaryVersion !== null
      );
      
      if (allHaveVersion) {
        tests.push({
          name: testName,
          status: 'PASS',
          message: `検索結果${items.length}件全てにsummaryVersion存在`
        });
      } else {
        tests.push({
          name: testName,
          status: 'FAIL',
          message: '検索結果にsummaryVersionが欠落'
        });
      }
    } else {
      tests.push({
        name: testName,
        status: 'FAIL',
        message: '検索失敗'
      });
    }
  } catch (error: any) {
    tests.push({
      name: testName,
      status: 'FAIL',
      message: error.message
    });
  }
}

async function runTests() {
  console.error('========================================');
  console.error('APIレスポンス修正 確認テスト');
  console.error('========================================\n');
  console.error(`開始時刻: ${new Date().toISOString()}`);
  console.error(`ベースURL: ${BASE_URL}\n`);

  // テスト実行
  console.error('▶ summaryVersionフィールドのテスト...');
  await testSummaryVersionInList();
  await testSummaryVersionInDetail();
  
  console.error('▶ articleTypeフィールドのテスト...');
  await testArticleTypeInList();
  
  console.error('▶ Version 7移行状況のテスト...');
  await testVersion7Distribution();
  
  console.error('▶ 検索機能との統合テスト...');
  await testSearchWithVersion();

  // 結果サマリー
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
    console.error(`${icon} ${test.name}`);
    if (test.message) {
      console.error(`   └─ ${test.message}`);
    }
  });

  // 失敗したテストの詳細
  const failedTests = tests.filter(t => t.status === 'FAIL');
  if (failedTests.length > 0) {
    console.error('\n❌ 失敗したテストの詳細:');
    console.error('─'.repeat(80));
    failedTests.forEach(test => {
      console.error(`テスト: ${test.name}`);
      console.error(`理由: ${test.message}`);
      console.error('');
    });
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