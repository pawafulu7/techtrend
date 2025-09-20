/**
 * Test Cursor-based Pagination
 * codex推奨: カーソルベースページネーションの動作確認
 */

import logger from '@/lib/logger';

async function testCursorPagination() {
  const baseUrl = 'http://localhost:3001/api/articles/list';

  logger.info('========== カーソルベースページネーション テスト開始 ==========');

  try {
    // Test 1: 初回リクエスト（カーソルなし）
    logger.info('\n=== Test 1: 初回リクエスト（オフセットベース） ===');
    const firstResponse = await fetch(`${baseUrl}?limit=5&sortBy=publishedAt&sortOrder=desc`);
    const firstData = await firstResponse.json();

    if (!firstData.success) {
      throw new Error('初回リクエスト失敗');
    }

    logger.info(`取得記事数: ${firstData.data.items.length}`);
    logger.info(`総記事数: ${firstData.data.total}`);
    logger.info(`ページ情報: ${JSON.stringify(firstData.data.pageInfo || 'オフセットベース')}`);

    // Test 2: カーソルを使用した次ページ取得
    if (firstData.data.pageInfo?.endCursor) {
      logger.info('\n=== Test 2: カーソルベース次ページ取得 ===');
      const nextResponse = await fetch(`${baseUrl}?limit=5&cursor=${firstData.data.pageInfo.endCursor}`);
      const nextData = await nextResponse.json();

      if (!nextData.success) {
        throw new Error('カーソルベースリクエスト失敗');
      }

      logger.info(`取得記事数: ${nextData.data.items.length}`);
      logger.info(`ページ情報: hasNext=${nextData.data.pageInfo?.hasNextPage}, hasPrev=${nextData.data.pageInfo?.hasPreviousPage}`);
      logger.info(`記事タイトル（最初）: ${nextData.data.items[0]?.title}`);

      // Test 3: afterパラメータを使用
      logger.info('\n=== Test 3: afterパラメータ使用 ===');
      const afterResponse = await fetch(`${baseUrl}?limit=3&after=${firstData.data.pageInfo.endCursor}`);
      const afterData = await afterResponse.json();

      logger.info(`取得記事数: ${afterData.data.items.length}`);
      logger.info(`X-Pagination-Mode: ${afterResponse.headers.get('X-Pagination-Mode')}`);

      // Test 4: 前ページ取得（beforeパラメータ）
      if (nextData.data.pageInfo?.startCursor) {
        logger.info('\n=== Test 4: beforeパラメータで前ページ取得 ===');
        const beforeResponse = await fetch(`${baseUrl}?limit=5&before=${nextData.data.pageInfo.startCursor}`);
        const beforeData = await beforeResponse.json();

        logger.info(`取得記事数: ${beforeData.data.items.length}`);
        logger.info(`前ページあり: ${beforeData.data.pageInfo?.hasPreviousPage}`);
      }
    }

    // Test 5: フィルターとカーソルの併用
    logger.info('\n=== Test 5: フィルターとカーソル併用 ===');
    const filteredResponse = await fetch(`${baseUrl}?limit=5&category=TECH&sortBy=publishedAt&sortOrder=desc`);
    const filteredData = await filteredResponse.json();

    if (filteredData.success && filteredData.data.pageInfo?.endCursor) {
      const filteredNextResponse = await fetch(`${baseUrl}?limit=5&category=TECH&cursor=${filteredData.data.pageInfo.endCursor}`);
      const filteredNextData = await filteredNextResponse.json();

      logger.info(`フィルター適用＋カーソル: ${filteredNextData.data.items.length}件取得`);
      logger.info(`カテゴリ確認: ${filteredNextData.data.items[0]?.category}`);
    }

    // Test 6: ソート条件変更時のカーソル無効化
    logger.info('\n=== Test 6: ソート条件変更でカーソル無効化 ===');
    if (firstData.data.pageInfo?.endCursor) {
      // 異なるソート条件でカーソルを使用
      const invalidSortResponse = await fetch(`${baseUrl}?limit=5&sortBy=createdAt&cursor=${firstData.data.pageInfo.endCursor}`);
      const invalidSortData = await invalidSortResponse.json();

      if (invalidSortData.success) {
        logger.info('ソート条件変更: カーソルは無視され、オフセットベースにフォールバック');
        logger.info(`X-Pagination-Mode: ${invalidSortResponse.headers.get('X-Pagination-Mode')}`);
      }
    }

    // Test 7: パフォーマンス比較
    logger.info('\n=== Test 7: パフォーマンス比較 ===');

    // オフセットベース（ページ10）
    const offsetStart = Date.now();
    const offsetResponse = await fetch(`${baseUrl}?page=10&limit=20`);
    await offsetResponse.json();
    const offsetTime = Date.now() - offsetStart;
    logger.info(`オフセットベース（page=10）: ${offsetTime}ms`);

    // カーソルベース（複数ページ遷移）
    let cursor = null;
    let totalCursorTime = 0;
    for (let i = 0; i < 3; i++) {
      const cursorStart = Date.now();
      const url = cursor ? `${baseUrl}?limit=20&cursor=${cursor}` : `${baseUrl}?limit=20`;
      const response = await fetch(url);
      const data = await response.json();
      totalCursorTime += Date.now() - cursorStart;

      if (data.data.pageInfo?.endCursor) {
        cursor = data.data.pageInfo.endCursor;
      } else {
        break;
      }
    }
    logger.info(`カーソルベース（3ページ遷移）: ${totalCursorTime}ms（平均: ${Math.round(totalCursorTime/3)}ms/ページ）`);

    // Test 8: キャッシュ効果確認
    logger.info('\n=== Test 8: キャッシュ効果確認 ===');

    // 同じカーソルで2回リクエスト
    if (firstData.data.pageInfo?.endCursor) {
      const cacheTestCursor = firstData.data.pageInfo.endCursor;

      // 1回目
      const cache1Response = await fetch(`${baseUrl}?limit=5&cursor=${cacheTestCursor}`);
      const cache1Status = cache1Response.headers.get('X-Cache-Status');
      const cache1Time = cache1Response.headers.get('X-Response-Time');

      // 2回目（キャッシュヒット期待）
      const cache2Response = await fetch(`${baseUrl}?limit=5&cursor=${cacheTestCursor}`);
      const cache2Status = cache2Response.headers.get('X-Cache-Status');
      const cache2Time = cache2Response.headers.get('X-Response-Time');

      logger.info(`1回目: Cache=${cache1Status}, Time=${cache1Time}`);
      logger.info(`2回目: Cache=${cache2Status}, Time=${cache2Time}`);
    }

    logger.info('\n✅ カーソルベースページネーションテスト完了');

  } catch (error) {
    logger.error('テスト失敗:', error);
    process.exit(1);
  }
}

// メイン実行
async function main() {
  try {
    await testCursorPagination();

    logger.info('\n========== 全テスト完了 ==========');
    process.exit(0);
  } catch (error) {
    logger.error('テスト実行エラー:', error);
    process.exit(1);
  }
}

main();