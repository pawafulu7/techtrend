#!/usr/bin/env -S tsx
/**
 * 並び順Cookie永続化のテスト
 * 取込順を選択してページリロードしても状態が保持されることを確認
 */

import { chromium } from 'playwright';

async function testSortPersistence() {
  console.error('🧪 並び順永続化のテスト開始...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. トップページにアクセス
    console.error('1. トップページにアクセス');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // 2. デフォルトの並び順を確認
    console.error('\n2. デフォルトの並び順を確認');
    const url = page.url();
    console.error(`   URL: ${url}`);
    const hasDefaultSort = !url.includes('sortBy=');
    console.error(`   デフォルト（公開順）: ${hasDefaultSort ? '✅' : '❌'}`);
    
    // 3. 取込順に変更
    console.error('\n3. 「取込順」ボタンをクリック');
    const createdAtButton = page.getByRole('button', { name: '取込順' });
    await createdAtButton.click();
    await page.waitForTimeout(1000);
    
    // URLが更新されることを確認
    await page.waitForFunction(() => {
      return window.location.search.includes('sortBy=createdAt');
    }, { timeout: 5000 });
    
    const urlAfterSort = page.url();
    console.error(`   URL: ${urlAfterSort}`);
    console.error(`   sortBy=createdAt: ${urlAfterSort.includes('sortBy=createdAt') ? '✅' : '❌'}`);
    
    // 4. Cookie確認
    console.error('\n4. Cookie確認');
    const cookies = await context.cookies();
    const filterPrefsCookie = cookies.find(c => c.name === 'filter-preferences');
    if (filterPrefsCookie) {
      const decoded = decodeURIComponent(filterPrefsCookie.value);
      const parsed = JSON.parse(decoded);
      console.error(`   filter-preferences.sortBy: ${parsed.sortBy || 'なし'}`);
      console.error(`   取込順が保存: ${parsed.sortBy === 'createdAt' ? '✅' : '❌'}`);
    } else {
      console.error('   ⚠️ filter-preferences cookieが見つかりません');
    }
    
    // 5. ページをリロード（URLパラメータなし）
    console.error('\n5. URLパラメータなしでアクセス（Cookie復元テスト）');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // 6. リロード後の状態確認
    const urlAfterReload = page.url();
    console.error(`\n6. リロード後の状態`);
    console.error(`   URL: ${urlAfterReload}`);
    
    // APIリクエストを監視して実際のsortByパラメータを確認
    const apiPromise = page.waitForResponse(response => 
      response.url().includes('/api/articles') && response.status() === 200
    );
    
    // ページを少しスクロールしてAPIリクエストをトリガー
    await page.evaluate(() => window.scrollBy(0, 100));
    
    try {
      const apiResponse = await apiPromise;
      const apiUrl = apiResponse.url();
      console.error(`   APIリクエスト: ${apiUrl}`);
      
      if (apiUrl.includes('sortBy=createdAt')) {
        console.error('   ✅ 取込順でAPIリクエストが送信されています');
      } else if (apiUrl.includes('sortBy=publishedAt') || !apiUrl.includes('sortBy=')) {
        console.error('   ❌ 公開順でAPIリクエストが送信されています（Cookie復元失敗）');
      } else {
        console.error(`   ⚠️ 予期しない並び順: ${apiUrl}`);
      }
    } catch (error) {
      console.error('   ⚠️ APIリクエストを確認できませんでした');
    }
    
    // 7. ボタンの状態確認
    console.error('\n7. ボタンのUI状態');
    const createdAtButtonAfterReload = page.getByRole('button', { name: '取込順' });
    const className = await createdAtButtonAfterReload.getAttribute('class');
    
    // variant="default"の場合、特定のクラスが含まれる
    const hasActiveClass = className?.includes('bg-primary') || 
                          className?.includes('default') ||
                          !className?.includes('outline');
    console.error(`   取込順ボタンがアクティブ: ${hasActiveClass ? '✅' : '❌'}`);
    
    // 8. 記事の並び順を確認（最初の記事のタイトルで判断）
    const firstArticle = page.locator('[data-testid="article-card"]').first();
    const articleExists = await firstArticle.count() > 0;
    if (articleExists) {
      const firstTitle = await firstArticle.locator('h3').textContent();
      console.error(`\n8. 最初の記事: "${firstTitle?.substring(0, 30)}..."`);
    }
    
    console.error('\n✨ テスト完了');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await browser.close();
  }
}

// 実行
testSortPersistence().catch(console.error);