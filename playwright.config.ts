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
  testMatch: ['**/e2e/**/*.spec.ts'],
  /* Global timeout for each test */
  timeout: process.env.CI ? 90000 : 45000,  // CI: 90秒、ローカル: 45秒（改訂版）
  /* Run tests in files in parallel */
  fullyParallel: true,  // ファイル単位での並列実行を有効化
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only - Phase 2で強化 */
  retries: process.env.CI ? 3 : 1,  // CI: 3回、ローカル: 1回
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : 3,  // ローカル環境では3並列、CI環境では2並列
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
    /* Timeout for each action */
    actionTimeout: process.env.CI ? 20000 : 15000,  // CI: 20秒、ローカル: 15秒（改訂版）
    /* Timeout for navigation */
    navigationTimeout: process.env.CI ? 45000 : 30000,  // CI: 45秒、ローカル: 30秒（改訂版）
    /* VRT用設定追加 */
    ignoreHTTPSErrors: true,
  },

  /* Visual Regression Testing設定 */
  expect: {
    timeout: process.env.CI ? 15000 : 10000,  // CI: 15秒、ローカル: 10秒（改訂版）
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
