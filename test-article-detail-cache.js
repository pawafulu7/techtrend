// 記事詳細キャッシュのエンドポイントテスト
const https = require('https');
const http = require('http');

const testEndpoints = async () => {
  console.log('🧪 記事詳細キャッシュのエンドポイントテスト開始\n');

  const results = {
    passed: 0,
    failed: 0,
    tests: []
  };

  // テスト対象のベースURL
  const baseUrl = 'http://localhost:3000';

  // テスト用の記事ID（既存の記事を使用）
  const articleIds = [
    'cmfifosrg002mtebnyw2cflv4',
    'cmfgz2b9k000tteegi7irxdm8'
  ];

  // 1. 記事詳細ページのテスト
  console.log('📝 Test 1: 記事詳細ページの取得');
  for (const articleId of articleIds) {
    await new Promise((resolve) => {
      const startTime = Date.now();
      http.get(`${baseUrl}/articles/${articleId}`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          const testResult = {
            name: `GET /articles/${articleId}`,
            status: res.statusCode,
            responseTime: responseTime,
            passed: res.statusCode === 200
          };

          if (testResult.passed) {
            console.log(`  ✅ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
            results.passed++;
          } else {
            console.log(`  ❌ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
            results.failed++;
          }
          results.tests.push(testResult);
          resolve();
        });
      }).on('error', (err) => {
        console.log(`  ❌ GET /articles/${articleId}: Error - ${err.message}`);
        results.failed++;
        results.tests.push({
          name: `GET /articles/${articleId}`,
          error: err.message,
          passed: false
        });
        resolve();
      });
    });
  }

  // 2. 関連記事APIのテスト
  console.log('\n📝 Test 2: 関連記事APIの取得');
  for (const articleId of articleIds) {
    await new Promise((resolve) => {
      const startTime = Date.now();
      http.get(`${baseUrl}/api/articles/${articleId}/related`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          const testResult = {
            name: `GET /api/articles/${articleId}/related`,
            status: res.statusCode,
            responseTime: responseTime,
            passed: res.statusCode === 200
          };

          if (testResult.passed) {
            console.log(`  ✅ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
            results.passed++;

            // JSONパースのテスト
            try {
              const json = JSON.parse(data);
              if (json.articles && Array.isArray(json.articles)) {
                console.log(`     📊 返却された関連記事数: ${json.articles.length}`);
              }
            } catch (e) {
              console.log(`     ⚠️ JSONパースエラー: ${e.message}`);
            }
          } else {
            console.log(`  ❌ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
            results.failed++;
          }
          results.tests.push(testResult);
          resolve();
        });
      }).on('error', (err) => {
        console.log(`  ❌ GET /api/articles/${articleId}/related: Error - ${err.message}`);
        results.failed++;
        results.tests.push({
          name: `GET /api/articles/${articleId}/related`,
          error: err.message,
          passed: false
        });
        resolve();
      });
    });
  }

  // 3. お気に入りバッチAPIのテスト
  console.log('\n📝 Test 3: お気に入りバッチAPIの取得');
  const articleIdParams = articleIds.join(',');
  await new Promise((resolve) => {
    const startTime = Date.now();
    http.get(`${baseUrl}/api/favorites/batch?articleIds=${articleIdParams}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        const testResult = {
          name: `GET /api/favorites/batch`,
          status: res.statusCode,
          responseTime: responseTime,
          passed: res.statusCode === 200 || res.statusCode === 401 // 401は未認証でも正常
        };

        if (testResult.passed) {
          console.log(`  ✅ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
          results.passed++;

          if (res.statusCode === 401) {
            console.log(`     ℹ️ 未認証状態でのテスト（正常）`);
          }
        } else {
          console.log(`  ❌ ${testResult.name}: ${res.statusCode} (${responseTime}ms)`);
          results.failed++;
        }
        results.tests.push(testResult);
        resolve();
      });
    }).on('error', (err) => {
      console.log(`  ❌ GET /api/favorites/batch: Error - ${err.message}`);
      results.failed++;
      results.tests.push({
        name: `GET /api/favorites/batch`,
        error: err.message,
        passed: false
      });
      resolve();
    });
  });

  // 4. キャッシュヒットのテスト（2回目のアクセス）
  console.log('\n📝 Test 4: キャッシュヒットの確認（2回目のアクセス）');
  const cacheTestResults = [];
  for (const articleId of articleIds.slice(0, 1)) { // 1つだけテスト
    // 1回目
    const firstAccessTime = await new Promise((resolve) => {
      const startTime = Date.now();
      http.get(`${baseUrl}/api/articles/${articleId}/related`, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          resolve(Date.now() - startTime);
        });
      }).on('error', () => resolve(-1));
    });

    // 2回目（キャッシュヒット期待）
    const secondAccessTime = await new Promise((resolve) => {
      const startTime = Date.now();
      http.get(`${baseUrl}/api/articles/${articleId}/related`, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          resolve(Date.now() - startTime);
        });
      }).on('error', () => resolve(-1));
    });

    if (firstAccessTime > 0 && secondAccessTime > 0) {
      const improvement = Math.round(((firstAccessTime - secondAccessTime) / firstAccessTime) * 100);
      console.log(`  ✅ キャッシュテスト: 1回目=${firstAccessTime}ms, 2回目=${secondAccessTime}ms`);
      console.log(`     📊 改善率: ${improvement}%`);

      if (secondAccessTime < firstAccessTime) {
        console.log(`     ✨ キャッシュが効いています！`);
        results.passed++;
      } else {
        console.log(`     ⚠️ キャッシュ効果が見られません`);
      }
    } else {
      console.log(`  ❌ キャッシュテスト: エラー`);
      results.failed++;
    }
  }

  // 結果サマリー
  console.log('\n' + '='.repeat(60));
  console.log('📊 テスト結果サマリー');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${results.passed}件`);
  console.log(`❌ 失敗: ${results.failed}件`);
  console.log(`📈 成功率: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);

  return results;
};

// テスト実行
testEndpoints().then((results) => {
  process.exit(results.failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('テスト実行エラー:', err);
  process.exit(1);
});