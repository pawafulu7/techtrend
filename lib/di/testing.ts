/**
 * Test-only DI helpers
 *
 * DO NOT import from production code.
 * This module is only for Jest test setup.
 *
 * Provides test provider registration and reset functions
 * without causing Jest globals to be bundled in production builds.
 *
 * @see CodexMCP Review: "Create test-only façade, stop importing from lib/di"
 * @see Issue: Jest bundling in production build
 */

type TestProviders = {
  registerTestProviders(): void;
  resetTestProviders(): void;
};

/**
 * Lazy-load test providers to avoid static dependency in production builds
 */
function loadTestProviders(): TestProviders {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./providers/test.provider') as TestProviders;
}

/**
 * Initialize test DI container
 *
 * Call this in beforeAll() or Jest setup
 */
export function initializeTestDI(): void {
  loadTestProviders().registerTestProviders();
}

/**
 * Reset test providers
 *
 * Call this in afterEach() to clean up test state
 */
export function resetTestProviders(): void {
  loadTestProviders().resetTestProviders();
}
