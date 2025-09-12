import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { testConfig } from './config/test.config';

// テスト環境変数読み込み
dotenv.config({ path: '.env.test' });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './',
  testMatch: ['**/e2e/**/*.spec.ts', '**/__tests__/e2e/**/*.spec.ts'],
  /* Global timeout for entire test run - 20分に延長 */
  globalTimeout: 20 * 60 * 1000,  // 20分（E2E全432テスト完走用）
  /* Global timeout for each test - Phase 1: タイムアウト改善 */
  timeout: process.env.CI ? 60000 : 60000,  // 60秒に統一（個別テスト用）
  /* Run tests in files in parallel */
  fullyParallel: true,  // ファイル単位での並列実行を有効化
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only - Phase 3: 削減 */
  retries: process.env.CI ? 1 : 1,  // CI: 1回（削減）、ローカル: 1回
  /* Opt out of parallel tests on CI. - Phase 1: 並列度最適化 */
  workers: process.env.CI ? 5 : (Number(process.env.E2E_WORKERS) || 3),  // CI: 5並列、ローカル: 環境変数または3並列
  /* Global setup and teardown */
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  /* CI環境でサーバーを自動起動 */
  webServer: testConfig.webServer || undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: testConfig.baseUrl,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Take screenshot on failure */
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true
    },
    /* Record video on failure */
    video: 'retain-on-failure',
    /* Timeout for each action - Phase 3: CI最適化 */
    actionTimeout: process.env.CI ? 10000 : 15000,  // CI: 10秒（短縮）、ローカル: 15秒
    /* Timeout for navigation - Phase 3: CI最適化 */
    navigationTimeout: process.env.CI ? 20000 : 30000,  // CI: 20秒（短縮）、ローカル: 30秒
    /* VRT用設定追加 */
    ignoreHTTPSErrors: true,
  },

  /* Visual Regression Testing設定 - Phase 3: CI最適化 */
  expect: {
    timeout: process.env.CI ? 5000 : 10000,  // CI: 5秒（短縮）、ローカル: 10秒
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.15,
      animations: 'disabled'
    }
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Webkit disabled due to WSL2 environment issues
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],
});
