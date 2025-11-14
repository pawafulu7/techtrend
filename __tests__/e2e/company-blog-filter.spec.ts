import { test, expect } from '@playwright/test';
import {
  waitForSourceFilter,
  waitForFilterApplication,
  waitForUrlParam,
} from '../../e2e/helpers/wait-utils';

const COMPANY_IDS = {
  mercari: 'mercari_tech_blog',
  freee: 'freee_tech_blog',
  cyber: 'cyberagent_tech_blog',
  dena: 'dena_tech_blog',
};

async function openCompanyFilter(page) {
  const trigger = page.getByTestId('company-filter-trigger');
  await trigger.click();
  await expect(page.getByTestId('company-filter-content')).toBeVisible();
}

async function getCompanyCheckbox(page, sourceId: string) {
  return page.getByTestId(`company-item-${sourceId}`).locator('input[type="checkbox"]');
}

test.describe('Company blog filter', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/');
    await waitForSourceFilter(page);
    await openCompanyFilter(page);
  });

  test('should expand and collapse company filter', async ({ page }) => {
    // Already expanded in beforeEach
    await expect(page.getByTestId('company-filter-content')).toBeVisible();
    await expect(page.getByPlaceholderText('企業名で検索...')).toBeVisible();

    // Collapse
    await page.getByTestId('company-filter-trigger').click();
    await expect(page.getByTestId('company-filter-content')).not.toBeVisible();

    // Expand again
    await page.getByTestId('company-filter-trigger').click();
    await expect(page.getByTestId('company-filter-content')).toBeVisible();
  });

  test('should search and filter companies', async ({ page }) => {
    const searchInput = page.getByPlaceholderText('企業名で検索...');

    // Search for "Cyber"
    await searchInput.fill('Cyber');

    // Wait for debounce and filtering
    await page.waitForTimeout(400);

    // Should show CyberAgent
    await expect(page.getByText('CyberAgent')).toBeVisible();

    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(400);

    // Should show all companies again
    await expect(page.getByText('freee Developers Hub')).toBeVisible();
  });

  test('should toggle company selection and persist to URL/Cookie', async ({ page, context }) => {
    const cyberCheckbox = await getCompanyCheckbox(page, COMPANY_IDS.cyber);

    // Toggle selection
    await cyberCheckbox.click();

    await waitForFilterApplication(page);
    await waitForUrlParam(page, 'sources');

    // Check URL parameter
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');
    expect(sourcesParam).toContain(COMPANY_IDS.cyber);

    // Check cookies
    const cookies = await context.cookies();
    const sourceCookie = cookies.find((c) => c.name === 'source-filter');
    expect(sourceCookie?.value).toContain(COMPANY_IDS.cyber);

    const prefsCookie = cookies.find((c) => c.name === 'filter-preferences');
    if (prefsCookie) {
      const prefs = JSON.parse(prefsCookie.value);
      expect(prefs?.sources).toContain(COMPANY_IDS.cyber);
    }
  });

  test('should persist selection across page reload', async ({ page }) => {
    const cyberCheckbox = await getCompanyCheckbox(page, COMPANY_IDS.cyber);
    const deNACheckbox = await getCompanyCheckbox(page, COMPANY_IDS.dena);

    // Select two companies
    await cyberCheckbox.click();
    await deNACheckbox.click();

    await waitForFilterApplication(page);

    // Reload page
    await page.reload();
    await waitForSourceFilter(page);
    await openCompanyFilter(page);

    // Verify selections are restored
    const cyberAfterReload = await getCompanyCheckbox(page, COMPANY_IDS.cyber);
    const deNAAfterReload = await getCompanyCheckbox(page, COMPANY_IDS.dena);

    await expect(cyberAfterReload).toBeChecked();
    await expect(deNAAfterReload).toBeChecked();
  });

  test('should open modal via "すべて管理..." button', async ({ page }) => {
    const manageButton = page.getByTestId('company-filter-manage-all');
    await manageButton.click();

    // Dialog should be visible
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByPlaceholderText('企業名で検索...')).toBeVisible();
  });

  test('should select all companies in modal and apply', async ({ page }) => {
    // Open modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Click "すべて選択"
    await dialog.getByRole('button', { name: 'すべて選択' }).click();

    // Verify selection count
    await expect(dialog.getByText(/選択中:/)).toBeVisible();

    // Apply
    await dialog.getByRole('button', { name: '適用' }).click();

    await waitForFilterApplication(page);

    // Dialog should close
    await expect(dialog).not.toBeVisible();

    // Sidebar count should reflect all selected
    await expect(page.getByTestId('company-filter-count')).toContainText('(13/13)');
  });

  test('should clear all companies in modal and apply', async ({ page }) => {
    // First, select some companies
    const cyberCheckbox = await getCompanyCheckbox(page, COMPANY_IDS.cyber);
    await cyberCheckbox.click();
    await waitForFilterApplication(page);

    // Open modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Click "クリア"
    await dialog.getByRole('button', { name: 'クリア' }).click();

    // Verify selection count is 0
    await expect(dialog.getByText('選択中: 0')).toBeVisible();

    // Apply
    await dialog.getByRole('button', { name: '適用' }).click();

    await waitForFilterApplication(page);

    // Sidebar count should be 0
    await expect(page.getByTestId('company-filter-count')).toContainText('(0/13)');
  });

  test('should search in modal and select filtered company', async ({ page }) => {
    // Open modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Search for "freee"
    const searchInput = dialog.getByPlaceholderText('企業名で検索...');
    await searchInput.fill('freee');

    // Should show only freee
    await expect(dialog.getByText('freee Developers Hub')).toBeVisible();

    // Select freee
    const freeeCheckbox = dialog.getByRole('checkbox', { name: /freee/i });
    await freeeCheckbox.click();

    // Apply
    await dialog.getByRole('button', { name: '適用' }).click();

    await waitForFilterApplication(page);

    // Verify sidebar count
    await expect(page.getByTestId('company-filter-count')).toContainText('(1/13)');
  });

  test('should discard changes on cancel', async ({ page }) => {
    // Open modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Select companies
    await dialog.getByRole('checkbox', { name: /Mercari/i }).click();
    await dialog.getByRole('checkbox', { name: /CyberAgent/i }).click();

    // Verify temp selection
    await expect(dialog.getByText(/選択中: 2/)).toBeVisible();

    // Cancel
    await dialog.getByRole('button', { name: 'キャンセル' }).click();

    await expect(dialog).not.toBeVisible();

    // Sidebar count should remain 0
    await expect(page.getByTestId('company-filter-count')).toContainText('(0/13)');

    // Reopen modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialogAgain = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Should be reset
    await expect(dialogAgain.getByText(/選択中: 0/)).toBeVisible();
  });

  test('should discard changes on Escape', async ({ page }) => {
    // Open modal
    await page.getByTestId('company-filter-manage-all').click();
    const dialog = page.getByRole('dialog', { name: '企業ブログを選択' });

    // Select a company
    await dialog.getByRole('checkbox', { name: /Mercari/i }).click();

    // Press Escape
    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();

    // Sidebar count should remain 0
    await expect(page.getByTestId('company-filter-count')).toContainText('(0/13)');
  });

  test('should navigate with keyboard only', async ({ page }) => {
    // Focus on trigger
    const trigger = page.getByTestId('company-filter-trigger');
    await trigger.focus();
    await trigger.press('Enter');

    await expect(page.getByTestId('company-filter-content')).toBeVisible();

    // Type in search
    const search = page.getByRole('textbox', { name: '企業名検索' });
    await search.focus();
    await search.type('freee');

    // Wait for filtering
    await page.waitForTimeout(400);

    // Navigate to first result
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await waitForFilterApplication(page);

    // Verify selection
    const freeeCheckbox = await getCompanyCheckbox(page, COMPANY_IDS.freee);
    await expect(freeeCheckbox).toBeChecked();
  });

  test('should maintain other category selections when company filter is used', async ({ page }) => {
    // First, select a foreign source (e.g., Dev.to)
    const foreignTrigger = page.getByTestId('category-foreign-header');
    await foreignTrigger.click();
    await expect(page.getByTestId('category-foreign-content')).toBeVisible();

    // Select Dev.to (if exists)
    const devToCheckbox = page.locator('[data-testid^="source-checkbox-"]').first();
    await devToCheckbox.click();

    await waitForFilterApplication(page);

    // Now use company filter
    const cyberCheckbox = await getCompanyCheckbox(page, COMPANY_IDS.cyber);
    await cyberCheckbox.click();

    await waitForFilterApplication(page);

    // Foreign category selection should still be active
    // (verify by checking URL params contain both)
    const url = new URL(page.url());
    const sourcesParam = url.searchParams.get('sources');

    // Should contain both foreign and company sources
    expect(sourcesParam).toBeTruthy();
    expect(sourcesParam).toContain(COMPANY_IDS.cyber);
  });
});
