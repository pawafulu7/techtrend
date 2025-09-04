#!/usr/bin/env -S tsx
/**
 * 「すべて解除」状態の永続化テスト
 * すべて解除を選択してページリロードしても状態が保持されることを確認
 */

import { chromium } from 'playwright';

async function testSourceDeselect() {
  console.error('🧪 ソースフィルター「すべて解除」のテスト開始...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. トップページにアクセス
    console.error('1. トップページにアクセス');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // 2. 「すべて解除」ボタンをクリック
    console.error('2. 「すべて解除」ボタンをクリック');
    await page.click('[data-testid="deselect-all-button"]');
    await page.waitForTimeout(1000);
    
    // 3. URL確認
    const urlAfterDeselect = page.url();
    console.error(`3. URL: ${urlAfterDeselect}`);
    const hasNoneParam = urlAfterDeselect.includes('sources=none');
    console.error(`   - sources=noneパラメータ: ${hasNoneParam ? '✅' : '❌'}`);
    
    // 4. 選択状態の確認
    const checkboxes = await page.locator('[data-testid^="source-checkbox-"] input[type="checkbox"]').all();
    let allUnchecked = true;
    for (const checkbox of checkboxes) {
      if (await checkbox.isChecked()) {
        allUnchecked = false;
        break;
      }
    }
    console.error(`4. 全ソース未選択: ${allUnchecked ? '✅' : '❌'}`);
    
    // 5. ページをリロード
    console.error('\n5. ページをリロード');
    await page.reload();
    await page.waitForTimeout(2000);
    
    // 6. リロード後のURL確認
    const urlAfterReload = page.url();
    console.error(`6. リロード後URL: ${urlAfterReload}`);
    const stillHasNoneParam = urlAfterReload.includes('sources=none');
    console.error(`   - sources=noneパラメータ維持: ${stillHasNoneParam ? '✅' : '❌'}`);
    
    // 7. リロード後の選択状態確認
    const checkboxesAfterReload = await page.locator('[data-testid^="source-checkbox-"] input[type="checkbox"]').all();
    let stillAllUnchecked = true;
    let checkedCount = 0;
    for (const checkbox of checkboxesAfterReload) {
      if (await checkbox.isChecked()) {
        stillAllUnchecked = false;
        checkedCount++;
      }
    }
    console.error(`7. リロード後も全ソース未選択: ${stillAllUnchecked ? '✅' : '❌'}`);
    if (!stillAllUnchecked) {
      console.error(`   ⚠️ ${checkedCount}個のソースが選択されています`);
    }
    
    // 8. Cookie確認
    console.error('\n8. Cookie確認:');
    const cookies = await context.cookies();
    const filterPrefsCookie = cookies.find(c => c.name === 'filter-preferences');
    const sourceFilterCookie = cookies.find(c => c.name === 'source-filter');
    
    if (filterPrefsCookie) {
      const decoded = decodeURIComponent(filterPrefsCookie.value);
      console.error(`   - filter-preferences: ${decoded.substring(0, 100)}...`);
      const parsed = JSON.parse(decoded);
      if (parsed.sources) {
        console.error(`     sources配列: ${JSON.stringify(parsed.sources)}`);
      }
    }
    
    if (sourceFilterCookie) {
      console.error(`   - source-filter: ${sourceFilterCookie.value}`);
    }
    
    // 9. 記事表示確認
    const articleCount = await page.locator('[data-testid="article-card"]').count();
    console.error(`\n9. 表示されている記事数: ${articleCount}`);
    console.error(`   ${articleCount === 0 ? '✅ 正しく0件' : '❌ 記事が表示されている'}`);
    
    console.error('\n✨ テスト完了');
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
  } finally {
    await browser.close();
  }
}

// 実行
testSourceDeselect().catch(console.error);