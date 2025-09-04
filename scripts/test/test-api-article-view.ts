#!/usr/bin/env npx tsx
/**
 * /api/article-views エンドポイントの統合テスト
 * 実際のHTTPリクエストで動作確認
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';

// 色付きコンソール出力
const log = {
  info: (msg: string) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  success: (msg: string) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
  error: (msg: string) => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  warning: (msg: string) => console.log(`\x1b[33m[WARNING]\x1b[0m ${msg}`),
};

// テスト用のセッションクッキー（実際のセッションが必要）
// 注: このテストを実行するには開発サーバーが起動している必要があります
async function testGetArticleViews() {
  log.info('GET /api/article-views のテスト...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/article-views?limit=10`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.status === 401) {
      log.warning('認証が必要です（401 Unauthorized）- これは正常な動作です');
      return true;
    }
    
    if (response.ok) {
      const data = await response.json();
      log.success(`GET /api/article-views: ${response.status} OK`);
      
      if (data.views && data.pagination) {
        log.info(`取得した閲覧履歴: ${data.views.length}件`);
        log.info(`ページ情報: ${JSON.stringify(data.pagination)}`);
      }
      return true;
    } else {
      log.error(`GET /api/article-views: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    log.error(`リクエストエラー: ${error}`);
    return false;
  }
}

async function testPostArticleView() {
  log.info('POST /api/article-views のテスト...');
  
  // まず記事を取得
  try {
    const articlesResponse = await fetch(`${BASE_URL}/api/articles?limit=1`, {
      method: 'GET',
    });
    
    if (!articlesResponse.ok) {
      log.error('記事の取得に失敗');
      return false;
    }
    
    const articlesData = await articlesResponse.json();
    if (!articlesData.articles || articlesData.articles.length === 0) {
      log.error('記事が見つかりません');
      return false;
    }
    
    const articleId = articlesData.articles[0].id;
    log.info(`テスト用記事ID: ${articleId}`);
    
    // 閲覧記録を送信
    const response = await fetch(`${BASE_URL}/api/article-views`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ articleId }),
    });
    
    if (response.ok) {
      const data = await response.json();
      log.success(`POST /api/article-views: ${response.status} OK`);
      log.info(`レスポンス: ${JSON.stringify(data)}`);
      
      // 未ログインユーザーの場合でも200が返る（記録はされない）
      if (data.message === 'View not recorded (not logged in)') {
        log.warning('未ログインのため記録されませんでした - これは正常な動作です');
      } else if (data.viewId) {
        log.success(`閲覧記録ID: ${data.viewId}`);
      }
      return true;
    } else {
      log.error(`POST /api/article-views: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    log.error(`リクエストエラー: ${error}`);
    return false;
  }
}

async function testDeleteArticleViews() {
  log.info('DELETE /api/article-views のテスト...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/article-views`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.status === 401) {
      log.warning('認証が必要です（401 Unauthorized）- これは正常な動作です');
      return true;
    }
    
    if (response.ok) {
      const data = await response.json();
      log.success(`DELETE /api/article-views: ${response.status} OK`);
      log.info(`削除された件数: ${data.clearedCount}`);
      return true;
    } else {
      log.error(`DELETE /api/article-views: ${response.status} ${response.statusText}`);
      return false;
    }
  } catch (error) {
    log.error(`リクエストエラー: ${error}`);
    return false;
  }
}

async function checkServerRunning() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  log.info('ArticleView APIエンドポイントの統合テストを開始');
  
  // 開発サーバーの確認
  const serverRunning = await checkServerRunning();
  if (!serverRunning) {
    log.error('開発サーバーが起動していません。`npm run dev`でサーバーを起動してください。');
    process.exit(1);
  }
  
  log.success('開発サーバーが稼働中');
  
  const results = [];
  
  // GET テスト
  results.push(await testGetArticleViews());
  
  // POST テスト
  results.push(await testPostArticleView());
  
  // DELETE テスト
  results.push(await testDeleteArticleViews());
  
  // 結果集計
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  log.info('');
  log.info('===== テスト結果サマリー =====');
  log.info(`実行: ${total}件`);
  log.info(`成功: ${passed}件`);
  log.info(`失敗: ${total - passed}件`);
  
  if (passed === total) {
    log.success('\n===== すべてのAPIテストが成功しました =====');
    log.info('注: 認証が必要なエンドポイントは401を返すことが正常動作です');
    process.exit(0);
  } else {
    log.error('\n===== 一部のテストが失敗しました =====');
    process.exit(1);
  }
}

main();