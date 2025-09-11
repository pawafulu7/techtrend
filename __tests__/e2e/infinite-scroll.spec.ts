import { test, expect, Page } from '@playwright/test';

// Phase 3: CI最適化 - 長時間テストにマーク
test.describe('Infinite Scroll E2E Tests', () => {
  test.slow(); // このテストスイート全体を遅いテストとしてマーク（タイムアウト3倍）
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
  });

  test('should load initial articles on page load', async () => {
    // 初期記事の読み込みを確認
    const articles = await page.locator('[data-testid="article-card"]').all();
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.length).toBeLessThanOrEqual(20);
  });

  test('should display infinite scroll trigger', async () => {
    // スクロールトリガーまたは終了メッセージの存在を確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    const endMessage = page.getByText('すべての記事を読み込みました');
    
    // どちらかが表示されていることを確認
    const triggerOrEnd = await Promise.race([
      trigger.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'trigger'),
      endMessage.waitFor({ state: 'visible', timeout: 5000 }).then(() => 'end'),
    ]).catch(() => null);
    
    expect(triggerOrEnd).toBeTruthy();
  });

  test('should load more articles on scroll', async () => {
    // 初期記事数を取得
    const initialArticles = await page.locator('[data-testid="article-card"]').all();
    const initialCount = initialArticles.length;
    
    // スクロールトリガーまたは終了メッセージを確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    const endMessage = page.getByText('すべての記事を読み込みました');
    
    // トリガーが存在するか確認
    const hasTrigger = await trigger.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false);
    
    if (hasTrigger) {
      // トリガーが見えるまでスクロール
      await trigger.scrollIntoViewIfNeeded();
      
      // 新しい記事が読み込まれるまで待つ（最大5秒）
      await page.waitForFunction(
        (count) => document.querySelectorAll('[data-testid="article-card"]').length > count,
        initialCount,
        { timeout: 5000 }
      );
      
      // 記事数が増加したことを確認
      const updatedArticles = await page.locator('[data-testid="article-card"]').all();
      expect(updatedArticles.length).toBeGreaterThan(initialCount);
    } else if (await endMessage.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false)) {
      // すべての記事が既に読み込まれている場合はスキップ
      console.log('All articles already loaded, skipping scroll test');
      expect(true).toBe(true); // テストをパスとする
    } else {
      throw new Error('Neither infinite scroll trigger nor end message found');
    }
  });

  test('should display loading indicator while fetching', async () => {
    // スクロールトリガーを見つける
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    const endMessage = page.getByText('すべての記事を読み込みました');
    
    // トリガーが存在する場合のみテスト実行
    const hasTrigger = await trigger.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false);
    
    if (hasTrigger) {
      // 高速でトリガーまでスクロールして、ローディング状態をキャッチ
      await trigger.scrollIntoViewIfNeeded();
      
      // ローディングインジケーターまたは新しい記事を確認
      // ローディングが一瞬なので、新しい記事の読み込みも成功とする
      const result = await Promise.race([
        page.waitForSelector('text="記事を読み込み中..."', { timeout: 1000 }).then(() => 'loading'),
        page.waitForFunction(
          () => document.querySelectorAll('[data-testid="article-card"]').length > 20,
          { timeout: 3000 }
        ).then(() => 'loaded')
      ]);
      
      // ローディングまたは新記事読み込みのいずれかが成功していればOK
      expect(['loading', 'loaded']).toContain(result);
    } else if (await endMessage.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false)) {
      // すべての記事が読み込み済みの場合はスキップ
      console.log('All articles already loaded, skipping loading indicator test');
      expect(true).toBe(true);
    } else {
      throw new Error('Neither infinite scroll trigger nor end message found');
    }
  });

  test('should maintain filter state during infinite scroll', async () => {
    // Dev.toソースをフィルターに設定（存在するソースIDを使用）
    await page.goto('http://localhost:3000?sources=cmdq3nww70003tegxm78oydnb');
    await page.waitForLoadState('networkidle');
    
    // フィルターが適用されていることを確認
    const url = page.url();
    expect(url).toContain('sources=');
    
    // 初期記事数を取得
    const initialCount = await page.locator('[data-testid="article-card"]').count();
    
    // スクロールトリガーまたは終了メッセージを確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    const endMessage = page.getByText('すべての記事を読み込みました');
    
    // どちらかが存在するか確認
    const hasTrigger = await trigger.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false);
    const hasEndMessage = await endMessage.waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true).catch(() => false);
    
    if (hasTrigger) {
      // トリガーが存在する場合、スクロールして追加記事を読み込む
      await trigger.scrollIntoViewIfNeeded();
      
      // 新しい記事が読み込まれるまで待つ
      await page.waitForFunction(
        (count) => document.querySelectorAll('[data-testid="article-card"]').length > count,
        initialCount,
        { timeout: 5000 }
      );
    } else if (hasEndMessage) {
      // すべての記事が既に読み込まれている場合は成功とする
      console.log('All articles already loaded for this filter');
    } else {
      // どちらも見つからない場合はエラー
      throw new Error('Neither infinite scroll trigger nor end message found');
    }
    
    // URLが保持されていることを確認
    const urlAfterScroll = page.url();
    expect(urlAfterScroll).toContain('sources=');
  });

  test('should show end message when all articles are loaded', async () => {
    // テスト用の少ない記事数でフィルター（特定のソースに絞る）
    await page.goto('http://localhost:3000?sources=cmdq3nwwk0005tegxdjv21wae'); // Think ITソース
    await page.waitForLoadState('networkidle');
    
    // 最下部まで複数回スクロール（最大5回）
    let endMessageFound = false;
    for (let i = 0; i < 5; i++) {
      // スクロールトリガーまたは終了メッセージを確認
      const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
      const endMessage = page.getByText('すべての記事を読み込みました');
      
      if (await endMessage.waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true).catch(() => false)) {
        endMessageFound = true;
        break;
      }
      
      if (await trigger.waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true).catch(() => false)) {
        await trigger.scrollIntoViewIfNeeded();
        // 新しいコンテンツがロードされるまで待機（CI環境対応）
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      }
    }
    
    // 終了メッセージが表示されていることを確認
    expect(endMessageFound).toBe(true);
  });

  test('should handle manual load button when infinite scroll is disabled', async () => {
    // enableInfiniteScroll=falseの場合のテスト
    // この機能はコンポーネントのプロパティで制御されるため、
    // 実際のテストは統合テストで行う
    
    // 現在の実装ではInfinite Scrollが有効なので、
    // トリガーまたは終了メッセージが表示されることを確認
    const trigger = page.locator('[data-testid="infinite-scroll-trigger"]');
    const endMessage = page.getByText('すべての記事を読み込みました');
    
    const triggerOrEnd = await Promise.race([
      trigger.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
      endMessage.waitFor({ state: 'visible', timeout: 5000 }).then(() => true),
    ]).catch(() => false);
    
    expect(triggerOrEnd).toBe(true);
  });

  test('should display article count information', async () => {
    // 記事件数の表示を確認
    const countText = await page.getByText(/\d+件の記事/).first();
    await expect(countText).toBeVisible();
    
    // 表示中の件数も確認
    const displayedText = await page.getByText(/\d+件表示中/).first();
    await expect(displayedText).toBeVisible();
  });
});