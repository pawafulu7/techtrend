import { test, expect } from '@playwright/test';
import { waitForPageLoad, waitForArticles } from '../../e2e/helpers/wait-utils';
import { getSourceIdsForPreset } from '../../lib/constants/source-presets';

test.describe('ソースフィルタープリセット機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await waitForPageLoad(page);
  });

  test('プリセットボタンが表示される', async ({ page }) => {
    await expect(page.getByTestId('preset-company')).toBeVisible();
    await expect(page.getByTestId('preset-ai-ml')).toBeVisible();
    await expect(page.getByTestId('preset-foreign')).toBeVisible();
    await expect(page.getByTestId('preset-domestic-all')).toBeVisible();
  });

  test('「国内企業」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();

    // URL更新を待つ
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // company カテゴリのソースのみが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');
    expect(sourcesParam).toBeTruthy();

    // 期待されるソースIDと一致することを確認
    const actualSourceIds = sourcesParam?.split(',').sort() || [];
    const expectedSourceIds = getSourceIdsForPreset('company').sort();
    expect(actualSourceIds).toEqual(expectedSourceIds);

    // 記事が表示されることを確認（企業ブログ記事が存在する場合）
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「AI/ML」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-ai-ml').first().click();

    // URL更新を待つ
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // ai/llm カテゴリのソースのみが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');
    expect(sourcesParam).toBeTruthy();

    // 期待されるソースIDと一致することを確認
    const actualSourceIds = sourcesParam?.split(',').sort() || [];
    const expectedSourceIds = getSourceIdsForPreset('ai-ml').sort();
    expect(actualSourceIds).toEqual(expectedSourceIds);

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「海外」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-foreign').first().click();

    // URL更新を待つ
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // foreign カテゴリのソースのみが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');
    expect(sourcesParam).toBeTruthy();

    // 期待されるソースIDと一致することを確認
    const actualSourceIds = sourcesParam?.split(',').sort() || [];
    const expectedSourceIds = getSourceIdsForPreset('foreign').sort();
    expect(actualSourceIds).toEqual(expectedSourceIds);

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('「国内全般」プリセットが正しく動作する', async ({ page }) => {
    // プリセットボタンをクリック（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-domestic-all').first().click();

    // URL更新を待つ
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // domestic + company カテゴリのソースのみが選択されていることを確認
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');
    expect(sourcesParam).toBeTruthy();

    // 期待されるソースIDと一致することを確認
    const actualSourceIds = sourcesParam?.split(',').sort() || [];
    const expectedSourceIds = getSourceIdsForPreset('domestic-all').sort();
    expect(actualSourceIds).toEqual(expectedSourceIds);

    // 記事が表示されることを確認
    await waitForArticles(page, { allowEmpty: true });
  });

  test('プリセット適用後、フィルターが永続化される', async ({ page }) => {
    // プリセット適用（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // URL確認
    const urlBefore = new URL(page.url());
    const sourcesParamBefore = urlBefore.searchParams.get('sources');

    // 別ページに遷移
    await page.goto('/tags');
    await waitForPageLoad(page);

    // トップページに戻る
    await page.goto('/');
    await waitForPageLoad(page);

    // フィルターが保持されていることを確認
    const urlAfter = new URL(page.url());
    const sourcesParamAfter = urlAfter.searchParams.get('sources');

    expect(sourcesParamAfter).toBeTruthy();
    expect(sourcesParamAfter).toBe(sourcesParamBefore);
  });

  test('プリセット適用後、ソースカウントが正しく表示される', async ({ page }) => {
    // プリセット適用前のカウントを取得
    const countBefore = await page.getByTestId('source-count').textContent();

    // 「国内企業」プリセット適用（複数存在する可能性があるため.first()を使用）
    await page.getByTestId('preset-company').first().click();
    await page.waitForURL(/sources=/, { timeout: 5000 });

    // カウント表示の更新を待つ
    await page.waitForFunction(
      (expectedText) => {
        const element = document.querySelector('[data-testid="source-count"]');
        return element?.textContent !== expectedText;
      },
      countBefore,
      { timeout: 2000 }
    );

    // プリセット適用後のカウントを取得
    const countAfter = await page.getByTestId('source-count').textContent();

    // カウントが変わったことを確認（全選択でなければ）
    expect(countAfter).toBeTruthy();
    expect(countAfter).toMatch(/\d+\/\d+/); // "N/M" 形式
  });
});
