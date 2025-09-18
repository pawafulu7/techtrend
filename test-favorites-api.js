// お気に入りAPIエンドポイントテスト
const http = require('http');

// テスト用の記事ID（実在するものを使用）
const testArticleId = 'cmfonm2uk0074te8utfzg0n7j';

// テストケース実行
async function runTests() {
  console.log('🧪 お気に入りAPIエンドポイントテスト開始\n');

  const tests = [
    {
      name: 'GET /api/favorites/[articleId] - 未認証',
      method: 'GET',
      path: `/api/favorites/${testArticleId}`,
      expectedStatus: 200,
      expectedBody: { isFavorited: false }
    },
    {
      name: 'POST /api/favorites/[articleId] - 未認証',
      method: 'POST',
      path: `/api/favorites/${testArticleId}`,
      expectedStatus: 401,
      expectedBody: { error: 'Unauthorized' }
    },
    {
      name: 'DELETE /api/favorites/[articleId] - 未認証',
      method: 'DELETE',
      path: `/api/favorites/${testArticleId}`,
      expectedStatus: 401,
      expectedBody: { error: 'Unauthorized' }
    },
    {
      name: 'OPTIONS /api/favorites/[articleId] - CORS',
      method: 'OPTIONS',
      path: `/api/favorites/${testArticleId}`,
      expectedStatus: 405
    }
  ];

  let passedTests = 0;
  let failedTests = 0;

  for (const test of tests) {
    try {
      const result = await makeRequest(test.method, test.path);

      // ステータスコード検証
      if (result.statusCode !== test.expectedStatus) {
        console.error(`❌ ${test.name}`);
        console.error(`   期待値: ${test.expectedStatus}, 実際: ${result.statusCode}`);
        failedTests++;
        continue;
      }

      // レスポンスボディ検証（期待値がある場合）
      if (test.expectedBody && result.body) {
        const body = JSON.parse(result.body);
        const isValid = Object.keys(test.expectedBody).every(
          key => body[key] === test.expectedBody[key]
        );

        if (!isValid) {
          console.error(`❌ ${test.name}`);
          console.error(`   期待値: ${JSON.stringify(test.expectedBody)}`);
          console.error(`   実際: ${JSON.stringify(body)}`);
          failedTests++;
          continue;
        }
      }

      console.log(`✅ ${test.name}`);
      passedTests++;
    } catch (error) {
      console.error(`❌ ${test.name}`);
      console.error(`   エラー: ${error.message}`);
      failedTests++;
    }
  }

  console.log('\n📊 テスト結果サマリー');
  console.log(`✅ 成功: ${passedTests}/${tests.length}`);
  console.log(`❌ 失敗: ${failedTests}/${tests.length}`);
  console.log(`🎯 成功率: ${Math.round((passedTests / tests.length) * 100)}%`);

  return {
    passed: passedTests,
    failed: failedTests,
    total: tests.length,
    successRate: Math.round((passedTests / tests.length) * 100)
  };
}

// HTTPリクエストヘルパー
function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// テスト実行
runTests().then(result => {
  process.exit(result.failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('テスト実行エラー:', error);
  process.exit(1);
});