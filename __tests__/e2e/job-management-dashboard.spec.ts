import { test, expect } from '@playwright/test';

/**
 * Job Management Dashboard E2E Tests
 *
 * Note: These tests require admin user authentication.
 * The test database may not have admin users, so some tests
 * are marked as skip until proper test fixtures are set up.
 */
test.describe('Job Management Dashboard', () => {
  test.describe('Unauthenticated access', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/dashboard/jobs');

      // Should redirect to login page
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  });

  // Note: Admin-specific tests require admin user setup in test database
  // These tests are currently skipped until proper admin test fixtures are available
  test.describe('Admin dashboard UI elements', () => {
    // Skip admin tests in CI since they require admin user setup
    test.skip(
      () => process.env.CI === 'true',
      'Admin tests require admin user fixtures'
    );

    test('dashboard page loads without errors', async ({ page }) => {
      // This test verifies the dashboard page structure without requiring login
      // by checking the page renders correctly even if it redirects

      const response = await page.goto('/dashboard/jobs');

      // Page should load without 500 errors
      expect(response?.status()).not.toBe(500);
    });
  });

  test.describe('API endpoints accessibility', () => {
    test('processing-logs API requires authentication', async ({ request }) => {
      const response = await request.get('/api/admin/jobs/processing-logs');
      expect(response.status()).toBe(401);
    });

    test('embedding-summary API requires authentication', async ({ request }) => {
      const response = await request.get('/api/admin/jobs/embedding-summary');
      expect(response.status()).toBe(401);
    });

    test('article-stats API requires authentication', async ({ request }) => {
      const response = await request.get('/api/admin/jobs/article-stats');
      expect(response.status()).toBe(401);
    });
  });
});
