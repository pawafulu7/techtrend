#!/usr/bin/env -S tsx
/**
 * リセットボタンの動作確認スクリプト
 * 全てのフィルター関連cookieが削除されることを確認
 */

import { chromium } from 'playwright';

async function testResetButton() {
  console.error('🧪 リセットボタンのテスト開始...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. トップページにアクセス
    console.error('1. トップページにアクセス');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // 2. フィルター条件を設定
    console.error('2. フィルター条件を設定');
    
    // 検索キーワード入力
    await page.fill('[data-testid="search-box-input"]', 'JavaScript');
    await page.waitForTimeout(1000);
    
    // ソート順を変更（品質順）
    const qualityButton = page.getByRole('button', { name: '品質' });
    if (await qualityButton.count() > 0) {
      await qualityButton.click();
      await page.waitForTimeout(500);
    }
    
    // 3. 現在のcookieを確認
    console.error('\n3. 設定後のCookie:');
    const cookiesBeforeReset = await context.cookies();
    const filterCookies = cookiesBeforeReset.filter(c => 
      c.name.includes('filter') || c.name.includes('source') || c.name.includes('view')
    );
    filterCookies.forEach(c => {
      console.error(`  - ${c.name}: ${c.value.substring(0, 50)}...`);
    });
    
    // 4. リセットボタンをクリック
    console.error('\n4. リセットボタンをクリック');
    await page.click('[data-testid="filter-reset-button"]');
    await page.waitForTimeout(2000); // リロード待機
    
    // 5. リセット後のcookieを確認
    console.error('\n5. リセット後のCookie:');
    const cookiesAfterReset = await context.cookies();
    const remainingFilterCookies = cookiesAfterReset.filter(c => 
      c.name.includes('filter') || c.name.includes('source') || c.name.includes('view')
    );
    
    let hasError = false;
    
    if (remainingFilterCookies.length === 0) {
      console.error('  ✅ 全てのフィルター関連cookieが削除されました');
    } else {
      hasError = true;
      console.error('  ⚠️ 以下のcookieが残っています:');
      remainingFilterCookies.forEach(c => {
        console.error(`    - ${c.name}: ${c.value.substring(0, 50)}...`);
      });
    }
    
    // 6. UI状態を確認
    console.error('\n6. UI状態の確認:');
    
    // 検索ボックスが空か
    const searchValue = await page.inputValue('[data-testid="search-box-input"]');
    if (searchValue !== '') {
      hasError = true;
    }
    console.error(`  - 検索ボックス: "${searchValue}" ${searchValue === '' ? '✅' : '❌'}`);
    
    // URLがクリーンか
    const url = page.url();
    const hasParams = url.includes('?');
    if (hasParams) {
      hasError = true;
    }
    console.error(`  - URL: ${url} ${!hasParams ? '✅' : '❌'}`);
    
    if (hasError) {
      console.error('\n❌ テストに失敗しました');
      process.exit(1);
    } else {
      console.error('\n✨ テスト完了');
    }
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await browser.close();
  }
}

// 実行
testResetButton().catch(console.error);