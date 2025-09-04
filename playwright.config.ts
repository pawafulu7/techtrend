import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import { testConfig } from './config/test.config';

// テスト環境変数読み込み
dotenv.config({ path: '.env.test' });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './__tests__/e2e',
  /* Global timeout for each test */
  timeout: 120000,  // 120秒に延長
  /* Run tests in files in parallel */
  fullyParallel: false,  // E2Eテストの安定性向上のためシリアル実行に変更
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: 1,  // 並列実行時の競合を避けるため1ワーカーに制限
  /* Global setup and teardown */
  globalSetup: './__tests__/e2e/global-setup.ts',
  globalTeardown: './__tests__/e2e/global-teardown.ts',
  /* CI環境でサーバーを自動起動 */
  webServer: process.env.CI ? testConfig.webServer : undefined,
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
    actionTimeout: 15000,
    /* Timeout for navigation */
    navigationTimeout: 60000,
    /* VRT用設定追加 */
    ignoreHTTPSErrors: true,
  },

  /* Visual Regression Testing設定 */
  expect: {
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

  /* 開発サーバー設定 - E2Eテスト時に自動起動 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3005',
    reuseExistingServer: true, // 既存サーバーを再利用
    timeout: 120000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/techtrend_test',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'test-secret-key-for-testing-purposes-only-32chars',
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      NODE_ENV: 'test',
    },
  },
});
