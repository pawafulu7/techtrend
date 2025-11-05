import { env } from '@/lib/config/env';

describe('lib/auth/config', () => {
  describe('OAuth provider registration', () => {
    it('should only register Google provider when credentials are set', () => {
      // This test verifies that providers are conditionally registered
      // based on environment variables from lib/config/env.ts

      const hasGoogleCreds = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
      const hasGithubCreds = !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);

      // Import after env is initialized
      const { authOptions } = require('@/lib/auth/config');

      // Credentials provider should always be present
      expect(authOptions.providers.length).toBeGreaterThanOrEqual(1);

      // Count OAuth providers
      const providerCount = authOptions.providers.length;
      let expectedCount = 1; // Credentials provider

      if (hasGoogleCreds) expectedCount++;
      if (hasGithubCreds) expectedCount++;

      expect(providerCount).toBe(expectedCount);
    });

    it('should not register providers with empty credentials', () => {
      const { authOptions } = require('@/lib/auth/config');

      authOptions.providers.forEach((provider: any) => {
        if (provider.id === 'google' || provider.id === 'github') {
          // OAuth providers should have valid credentials if registered
          // The mock structure exposes credentials via options object
          if (provider.options) {
            expect(provider.options.clientId).toBeTruthy();
            expect(provider.options.clientSecret).toBeTruthy();
            expect(provider.options.clientId).not.toBe('');
            expect(provider.options.clientSecret).not.toBe('');
          }
        }
      });
    });
  });
});
