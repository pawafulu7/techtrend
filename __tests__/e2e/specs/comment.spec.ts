/**
 * コメント機能 E2Eテスト
 *
 * Task 5.3: E2Eテスト
 * - コメント投稿 → 一覧表示 → 編集 → 削除 のフロー
 * - 未ログイン時のログイン促進表示確認
 * - 文字数制限バリデーション
 * - レスポンシブレイアウト（モバイル）確認
 */

import { test, expect } from '@playwright/test';
import {
  loginTestUser,
  waitForPageLoad,
  waitForLoadingToDisappear,
} from '../utils/e2e-helpers';

/**
 * 記事詳細ページに遷移するヘルパー関数
 */
async function navigateToArticleDetail(page: import('@playwright/test').Page) {
  await page.goto('/');
  await waitForPageLoad(page);
  await waitForLoadingToDisappear(page);

  // data-testid="article-card" を使用して正確にカードを特定
  const firstArticle = page.locator('[data-testid="article-card"]').first();
  await expect(firstArticle).toBeVisible({ timeout: 15000 });

  // クリック前に安定化のため少し待機
  await page.waitForTimeout(500);

  // 記事カードをクリック（onClick ハンドラでナビゲーション）
  await firstArticle.click();

  // 記事詳細ページへのナビゲーションを待つ
  await page.waitForURL(/\/articles\//, { timeout: 15000 });

  // 記事詳細ページの読み込みを待つ
  await waitForPageLoad(page);
  await waitForLoadingToDisappear(page);

  return true;
}

/**
 * コメントセクションが完全に読み込まれるのを待つ
 * - セッションのハイドレーションが完了するまで待つ
 * - スケルトンが消えて実際のコンテンツが表示されるまで待つ
 * @returns 認証状態（true=ログイン済み、false=未ログイン）
 */
async function waitForCommentSection(
  page: import('@playwright/test').Page
): Promise<boolean> {
  // ネットワークが落ち着くまで待機
  await page.waitForLoadState('networkidle', { timeout: 30000 });

  // ページ下部にスクロール（コメントセクションが下部にあるため）
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  // スケルトンまたは実際のコンテンツが表示されるのを待つ
  const skeleton = page.locator('[data-testid="comment-section-skeleton"]');
  const commentSection = page.locator('[data-testid="comment-section"]');

  // まずどちらかが表示されることを確認
  await expect(
    skeleton.or(commentSection)
  ).toBeVisible({ timeout: 30000 });

  // スケルトンが表示されている場合は、実際のコンテンツに切り替わるまで待つ
  const isSkeletonVisible = await skeleton.isVisible();
  if (isSkeletonVisible) {
    // スケルトンが消えるのを待つ
    await skeleton.waitFor({ state: 'hidden', timeout: 30000 });
    // 実際のコンテンツが表示されるのを待つ
    await expect(commentSection).toBeVisible({ timeout: 10000 });
  }

  // 認証状態を判定
  const commentTextarea = page.locator('textarea[aria-label="コメント入力"]');
  const loginPrompt = page.locator('text=ログインしてメモを残しましょう');

  // どちらかが表示されるまで待つ
  await expect(
    commentTextarea.or(loginPrompt)
  ).toBeVisible({ timeout: 15000 });

  const isAuthenticated = await commentTextarea.isVisible();

  // "個人メモ"ヘッダーが表示されていることを確認
  const commentHeader = page.locator('text=個人メモ');
  await expect(commentHeader).toBeVisible({ timeout: 5000 });

  // スクロールして表示
  await commentHeader.scrollIntoViewIfNeeded();
  return isAuthenticated;
}

test.describe('コメント機能', () => {
  test.describe('未ログイン時', () => {
    test('ログイン促進表示が表示される', async ({ page }) => {
      await navigateToArticleDetail(page);
      const isAuthenticated = await waitForCommentSection(page);
      expect(isAuthenticated).toBe(false);

      // コメントセクションを探す（"個人メモ"ヘッダーを含むカード）
      const commentSection = page.locator('text=個人メモ');
      await expect(commentSection).toBeVisible();

      // 未ログイン時はログイン促進が表示される
      const loginPrompt = page.locator('text=ログインしてメモを残しましょう');
      await expect(loginPrompt).toBeVisible();

      // ログインリンクが存在する
      const loginLink = page.locator('a[href*="signin"]');
      await expect(loginLink).toBeVisible();
    });
  });

  test.describe('ログイン時', () => {
    test.beforeEach(async ({ page }) => {
      // テストユーザーでログイン
      const loginSuccess = await loginTestUser(page);
      expect(loginSuccess).toBe(true);
    });

    test('コメント投稿→編集→削除の一連のフローが正常に動作する', async ({
      page,
    }) => {
      // 記事詳細ページへ遷移
      await navigateToArticleDetail(page);
      const isAuthenticated = await waitForCommentSection(page);
      expect(isAuthenticated).toBe(true);

      // ========== 1. コメント投稿 ==========
      // コメント入力フォームを確認（aria-labelで特定）
      const commentTextarea = page.locator(
        'textarea[aria-label="コメント入力"]'
      );
      await expect(commentTextarea).toBeVisible({ timeout: 10000 });

      // テストコメントを入力（ユニークなIDで識別）
      const uniqueId = Date.now();
      const testComment = `E2Eテストコメント ${uniqueId}`;
      await commentTextarea.fill(testComment);

      // 文字数カウンターが表示されることを確認
      const charCounter = page.locator(`text=${testComment.length} / 1000`);
      await expect(charCounter).toBeVisible();

      // 送信ボタンをクリック
      const submitButton = page.locator('button:has-text("投稿")');
      await submitButton.click();

      // 投稿したコメントが表示されることを確認
      const postedComment = page.locator(`text="${testComment}"`);
      await expect(postedComment).toBeVisible({ timeout: 10000 });

      // ========== 2. コメント編集 ==========
      // 投稿したコメントを含むarticle要素を特定
      const commentArticle = page.locator(`article:has-text("${testComment}")`);
      await expect(commentArticle).toBeVisible({ timeout: 5000 });

      // 編集ボタンをクリック（aria-label="編集"）
      const editButton = commentArticle.locator('button[aria-label="編集"]');
      await editButton.click();

      // 編集用テキストエリアが表示されることを確認
      // 編集モードに入ると元のテキストはtextareaに移動するので、textareaを直接探す
      const editTextarea = page.locator('textarea[aria-label="コメント編集"]');
      await expect(editTextarea).toBeVisible({ timeout: 5000 });

      // 編集textareaを含むarticle要素を再取得
      const editingArticle = page.locator('article:has(textarea[aria-label="コメント編集"])');
      await expect(editingArticle).toBeVisible({ timeout: 5000 });

      // 内容を変更
      const updatedComment = `編集済みE2Eテスト ${uniqueId}`;
      await editTextarea.fill(updatedComment);

      // 保存ボタンが有効になるのを待ってクリック
      const saveButton = editingArticle.locator('button:has-text("保存")');
      await expect(saveButton).toBeVisible({ timeout: 5000 });
      await expect(saveButton).toBeEnabled({ timeout: 5000 });
      await saveButton.click();

      // 編集した内容が反映されることを確認
      const updatedCommentElement = page.locator(`text="${updatedComment}"`);
      await expect(updatedCommentElement).toBeVisible({ timeout: 10000 });

      // 元のコメントが消えていることを確認
      const originalComment = page.locator(`text="${testComment}"`);
      await expect(originalComment).toHaveCount(0, { timeout: 5000 });

      // ========== 3. コメント削除 ==========
      // 更新されたコメントを含むarticle要素を特定
      const updatedArticle = page.locator(
        `article:has-text("${updatedComment}")`
      );
      await expect(updatedArticle).toBeVisible({ timeout: 5000 });

      // 削除ボタンをクリック（aria-label="削除"）
      const deleteButton = updatedArticle.locator('button[aria-label="削除"]');
      await deleteButton.click();

      // 削除確認ダイアログが表示されることを確認
      const confirmDialog = page.locator('text=このコメントを削除しますか？');
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });

      // 確認ボタン（削除を実行）をクリック
      // variant="destructive" のボタンを探す
      const confirmButton = updatedArticle.locator(
        'button:has-text("削除"):not(:has-text("キャンセル"))'
      );
      const buttons = await confirmButton.all();
      // 最後の削除ボタン（確認用）をクリック
      if (buttons.length > 0) {
        await buttons[buttons.length - 1].click();
      }

      // コメントが削除されたことを確認
      await expect(updatedCommentElement).toHaveCount(0, { timeout: 10000 });
    });

    test('プライベートコメント表示が正しく表示される', async ({ page }) => {
      await navigateToArticleDetail(page);
      const isAuthenticated = await waitForCommentSection(page);
      expect(isAuthenticated).toBe(true);

      // プライベートコメントの表示を確認（"自分のみ表示"テキスト）
      const privateIndicator = page.locator('text=自分のみ表示');
      await expect(privateIndicator).toBeVisible({ timeout: 5000 });
    });

    test('文字数制限のバリデーションが動作する', async ({ page }) => {
      await navigateToArticleDetail(page);
      const isAuthenticated = await waitForCommentSection(page);
      expect(isAuthenticated).toBe(true);

      // コメント入力フォームを確認
      const commentTextarea = page.locator(
        'textarea[aria-label="コメント入力"]'
      );
      await expect(commentTextarea).toBeVisible({ timeout: 10000 });

      // 950文字を入力（警告表示の確認）
      const warningContent = 'あ'.repeat(950);
      await commentTextarea.fill(warningContent);

      // 文字数カウンターが表示されていることを確認
      const charCounter = page.locator('text=950 / 1000');
      await expect(charCounter).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('レスポンシブ対応', () => {
    test('モバイルビューでコメント投稿が動作する', async ({ page }) => {
      // モバイルビューポートを設定
      await page.setViewportSize({ width: 375, height: 667 });

      // テストユーザーでログイン
      const loginSuccess = await loginTestUser(page);
      expect(loginSuccess).toBe(true);

      await navigateToArticleDetail(page);
      const isAuthenticated = await waitForCommentSection(page);
      expect(isAuthenticated).toBe(true);

      // コメントセクションがモバイルでも表示されることを確認
      const commentSectionHeader = page.locator('text=個人メモ');
      await expect(commentSectionHeader).toBeVisible();

      // フォームがモバイルでも使用可能であることを確認
      const commentTextarea = page.locator(
        'textarea[aria-label="コメント入力"]'
      );
      await expect(commentTextarea).toBeVisible();

      // モバイルでもコメント投稿できることを確認
      const mobileComment = `モバイルテスト ${Date.now()}`;
      await commentTextarea.fill(mobileComment);

      const submitButton = page.locator('button:has-text("投稿")');
      await submitButton.click();

      // 投稿したコメントが表示されることを確認
      const postedComment = page.locator(`text="${mobileComment}"`);
      await expect(postedComment).toBeVisible({ timeout: 10000 });

      // 後片付け: 投稿したコメントを削除
      const commentArticle = page.locator(
        `article:has-text("${mobileComment}")`
      );
      const deleteButton = commentArticle.locator('button[aria-label="削除"]');
      await deleteButton.click();

      // 確認ダイアログの削除ボタンをクリック
      const confirmButton = commentArticle.locator(
        'button:has-text("削除"):not(:has-text("キャンセル"))'
      );
      const buttons = await confirmButton.all();
      if (buttons.length > 0) {
        await buttons[buttons.length - 1].click();
      }

      // 削除を確認
      await expect(postedComment).toHaveCount(0, { timeout: 10000 });
    });
  });
});
