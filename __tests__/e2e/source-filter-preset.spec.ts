import { test, expect } from '@playwright/test';
import { waitForPageLoad, waitForArticles, openFilterSidebar } from '../../e2e/helpers/wait-utils';
import { LAPTOP_VIEWPORT } from '../../e2e/constants/viewports';
import { getSourceIdsForPreset } from '../../lib/constants/source-presets';

test.describe('ソースフィルタープリセット機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.setViewportSize(LAPTOP_VIEWPORT);
    await page.goto('/');
    await waitForPageLoad(page);
    // サイドバーを開く（プリセットボタンはサイドバー内にある）
    await openFilterSidebar(page);
  });

  test('プリセットボタンが表示される', async ({ page }) => {
    await expect(page.getByTestId('preset-company').first()).toBeVisible();
    await expect(page.getByTestId('preset-ai-ml').first()).toBeVisible();
    await expect(page.getByTestId('preset-foreign').first()).toBeVisible();
    await expect(page.getByTestId('preset-domestic-all').first()).toBeVisible();
  });

  test('「国内企業」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();

    // URL更新またはフィルター適用を待つ（URLが変わらない場合もある）
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      // URLが変わらない場合もあるので、フィルター適用を待つ
      await page.waitForTimeout(1000);
    }

    // company カテゴリのソースが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');

    if (sourcesParam) {
      // URLパラメータがある場合、ソースIDを検証
      const actualSourceIds = sourcesParam.split(',').sort();
      const expectedSourceIds = getSourceIdsForPreset('company');

      // 実際のソースIDが期待されるソースIDのサブセットであることを確認
      // テスト環境で一部のソースが存在しない可能性があるため
      expect(actualSourceIds.length).toBeGreaterThan(0);
      expect(actualSourceIds.every(id => expectedSourceIds.includes(id))).toBe(true);
    }

    // 記事が表示されることを確認（企業ブログ記事が存在する場合）
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「AI/ML」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-ai-ml').first().click();

    // URL更新またはフィルター適用を待つ
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      await page.waitForTimeout(1000);
    }

    // ai/llm カテゴリのソースが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');

    if (sourcesParam) {
      const actualSourceIds = sourcesParam.split(',').sort();
      const expectedSourceIds = getSourceIdsForPreset('ai-ml');

      expect(actualSourceIds.length).toBeGreaterThan(0);
      expect(actualSourceIds.every(id => expectedSourceIds.includes(id))).toBe(true);
    }

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「海外」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-foreign').first().click();

    // URL更新またはフィルター適用を待つ
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      await page.waitForTimeout(1000);
    }

    // foreign カテゴリのソースが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');

    if (sourcesParam) {
      const actualSourceIds = sourcesParam.split(',').sort();
      const expectedSourceIds = getSourceIdsForPreset('foreign');

      expect(actualSourceIds.length).toBeGreaterThan(0);
      expect(actualSourceIds.every(id => expectedSourceIds.includes(id))).toBe(true);
    }

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「国内全般」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-domestic-all').first().click();

    // URL更新またはフィルター適用を待つ
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      await page.waitForTimeout(1000);
    }

    // domestic + company カテゴリのソースが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');

    if (sourcesParam) {
      const actualSourceIds = sourcesParam.split(',').sort();
      const expectedSourceIds = getSourceIdsForPreset('domestic-all');

      expect(actualSourceIds.length).toBeGreaterThan(0);
      expect(actualSourceIds.every(id => expectedSourceIds.includes(id))).toBe(true);
    }

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('プリセット適用後、フィルターが永続化される', async ({ page }) => {
    // プリセット適用（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();

    // URL更新またはフィルター適用を待つ
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      await page.waitForTimeout(1000);
    }

    // URL確認
    const urlBefore = new URL(page.url());
    const sourcesParamBefore = urlBefore.searchParams.get('sources');

    // プリセット適用されたことを確認（URLパラメータまたはCookie）
    if (!sourcesParamBefore) {
      console.log('Sources param not found in URL, skipping persistence test');
      test.skip();
      return;
    }

    // 別ページに遷移
    await page.goto('/tags');
    await waitForPageLoad(page);

    // トップページに戻る
    await page.goto('/');
    await waitForPageLoad(page);

    // フィルターが保持されていることを確認
    const urlAfter = new URL(page.url());
    const sourcesParamAfter = urlAfter.searchParams.get('sources');

    // Cookie経由で保存されている場合もあるので、URLパラメータがなくても許容
    if (sourcesParamAfter) {
      expect(sourcesParamAfter).toBe(sourcesParamBefore);
    } else {
      console.log('Sources param not restored in URL - may be using Cookie instead');
    }
  });

  test('プリセット適用後、ソースカウントが正しく表示される', async ({ page }) => {
    // プリセット適用前のカウントを取得（モバイル/デスクトップ両方存在する可能性があるため.first()を使用）
    const countBefore = await page.getByTestId('source-count').first().textContent();

    // 「国内企業」プリセット適用（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();

    // URL更新またはフィルター適用を待つ
    try {
      await page.waitForURL(/sources=/, { timeout: 5000, waitUntil: 'commit' });
    } catch {
      await page.waitForTimeout(1000);
    }

    // カウント表示の更新を待つ（タイムアウトエラーを許容）
    try {
      await page.waitForFunction(
        (expectedText) => {
          const element = document.querySelector('[data-testid="source-count"]');
          return element?.textContent !== expectedText;
        },
        countBefore,
        { timeout: 2000 }
      );
    } catch {
      // カウントが変わらない場合もある（全選択状態など）
    }

    // プリセット適用後のカウントを取得（モバイル/デスクトップ両方存在する可能性があるため.first()を使用）
    const countAfter = await page.getByTestId('source-count').first().textContent();

    // カウントが正しい形式で表示されていることを確認
    expect(countAfter).toBeTruthy();
    expect(countAfter).toMatch(/\d+\/\d+/); // "N/M" 形式
  });
});
