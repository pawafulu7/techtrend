import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import eslintConfigPrettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules - temporarily set to warn
      // TODO: Address these in a follow-up PR to enable full React Compiler support
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      // Note: Hardcoded Tailwind color detection is handled by grep in CI
      // See: npm run lint:colors (uses grep to find bg-/text-/border- patterns)
      // ESLint's no-restricted-syntax cannot reliably detect class names in strings
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@/lib/database',
          message: "Use '@/lib/prisma' instead. @/lib/database is deprecated.",
        }],
      }],
    },
  },
  // Enforce centralized env access in lib/ (process.env.NODE_ENV is allowed)
  {
    files: ['lib/**/*.ts', 'lib/**/*.tsx'],
    ignores: [
      'lib/config/env.ts',
      'lib/logger.ts',
      'lib/logger.client.ts',
      'lib/hooks/**',
      'lib/cookies/**',
      'lib/errors/**',
      'lib/utils/article/article-link-extractor.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV']",
        message: "Use `env` from `@/lib/config/env` instead of direct `process.env` access."
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Custom ignores
    '**/__mocks__/**',
    '**/__tests__/**',
    '**/node_modules/**',
    'dist/**',
    'coverage/**',
    '.backup/**',
    'tmp/**',
    'temp/**',
    'test/**',
    'test_debug.ts',
    'test_*.ts',
    '**/test-*.ts',
    'testStability.ts',
    '*.tsbuildinfo',
    'e2e/**',
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/*.test.tsx',
    '*.config.js',
    'ecosystem*.js',
    'jest.*.js',
    'playwright.config.ts',
    'scripts/**',
    'prisma/seed.ts',
    'prisma/seed-*.ts',
    'hooks/use-toast.ts',
    'hooks/useSession.ts',
    'test-*.js',
    'test-*.ts',
    '*-test.js',
    '*-test.ts',
    'playwright-report/**',
    'test-results/**',
    'types/**'
  ]),
])

export default eslintConfig
