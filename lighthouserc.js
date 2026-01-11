/**
 * Lighthouse CI Configuration
 * Measures Core Web Vitals for key pages
 */
module.exports = {
  ci: {
    collect: {
      // Use static server for built app
      staticDistDir: '.next',
      // Start command for Next.js
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready',
      startServerReadyTimeout: 30000,
      // URLs to test
      // Note: Only use routes that exist in the app. Verify with `npm run build` output.
      url: [
        'http://localhost:3000/',           // Top page (contains article list)
        'http://localhost:3000/auth/login', // Login page (static, no DB dependency)
      ],
      // Number of runs per URL for consistent results
      numberOfRuns: 3,
      // Chrome flags for CI environment
      settings: {
        chromeFlags: '--no-sandbox --headless --disable-gpu',
        // Throttling settings (simulated mobile)
        throttlingMethod: 'simulate',
        // Form factor
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    assert: {
      // Assertions for Core Web Vitals
      assertions: {
        // Performance metrics
        'categories:performance': ['warn', { minScore: 0.7 }],
        'categories:accessibility': ['warn', { minScore: 0.8 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.8 }],

        // Core Web Vitals
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 1800 }],
        'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'speed-index': ['warn', { maxNumericValue: 3400 }],

        // Interactive metrics
        'interactive': ['warn', { maxNumericValue: 3800 }],
      },
    },
    upload: {
      // Use temporary public storage (no server setup required)
      target: 'temporary-public-storage',
    },
  },
};
